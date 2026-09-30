import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { InMemoryKeyValueCache } from '../../src/infra/cache/in-memory-key-value-cache';
import { KEY_VALUE_CACHE } from '../../src/infra/cache/key-value-cache';
import { MailService, SendMailInput } from '../../src/infra/mail/mail.service';
import { PasswordHasher } from '../../src/modules/auth/password-hasher.service';
import { UsersService } from '../../src/modules/users/users.service';

/**
 * Gerçek, migration'ları uygulanmış bir test veritabanı isteyen e2e'ler için
 * ortak kurulum. Redis kullanılmaz: membership cache bellek içidir, throttle
 * kapalıdır. Gönderilen mailler `sentMails`'te toplanır.
 *
 *   E2E_DATABASE=true \
 *   DATABASE_URL=postgres://seo:seo@localhost:5432/seo_test \
 *   DATABASE_SKIP_INITIALIZATION=false \
 *   bun run --filter api test:e2e
 */
export const describeWithDatabase =
  process.env.E2E_DATABASE === 'true' ? describe : describe.skip;

export const TEST_PASSWORD = 'cok-gizli-sifre-123';

/** Her testten önce boşaltılan tablolar; yeni tenant tabloları buraya eklenir. */
const TABLES = [
  'audit_logs',
  'invitations',
  'projects',
  'clients',
  'memberships',
  'organizations',
  'refresh_tokens',
  'users',
];

/** Limitler auth testlerinde doğrulanır; burada birçok login yapıldığı için kapalı. */
const unlimitedThrottlerStorage: ThrottlerStorage = {
  increment: (_key, ttl) =>
    Promise.resolve({
      totalHits: 1,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
};

export interface E2eContext {
  app: INestApplication<App>;
  dataSource: DataSource;
  cache: InMemoryKeyValueCache;
  sentMails: SendMailInput[];
  http: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
  /** Kullanıcıyı doğrudan oluşturur (kayıt ilk kullanıcıdan sonra davetle olur). */
  createUser: (email: string, name?: string) => Promise<string>;
  /** Giriş yapıp access token döner. */
  login: (email: string) => Promise<string>;
}

export async function createE2eApp(): Promise<E2eContext> {
  const cache = new InMemoryKeyValueCache();
  const sentMails: SendMailInput[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue(unlimitedThrottlerStorage)
    .overrideProvider(KEY_VALUE_CACHE)
    .useValue(cache)
    .overrideProvider(MailService)
    .useValue({
      send: (input: SendMailInput) => {
        sentMails.push(input);
        return Promise.resolve();
      },
    })
    .compile();
  // E2E_LOG=true ile uygulama logları (500'lerin nedeni) görünür.
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: process.env.E2E_LOG === 'true' ? undefined : false,
  });
  configureApp(app);
  await app.init();

  const dataSource = moduleRef.get(DataSource);
  const usersService = moduleRef.get(UsersService, { strict: false });
  const passwordHasher = moduleRef.get(PasswordHasher, { strict: false });
  const http = () => request(app.getHttpServer());

  return {
    app: app,
    dataSource,
    cache,
    sentMails,
    http,
    reset: async () => {
      await dataSource.query(
        `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`,
      );
      cache.clear();
      sentMails.length = 0;
    },
    close: () => app.close(),
    createUser: async (email, name = email.split('@')[0]) => {
      const user = await usersService.create({
        email,
        name,
        passwordHash: await passwordHasher.hash(TEST_PASSWORD),
      });
      return user.id;
    },
    login: async (email) => {
      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: TEST_PASSWORD });
      if (response.status !== 200) {
        throw new Error(`login başarısız: ${response.status}`);
      }
      return (response.body as { accessToken: string }).accessToken;
    },
  };
}

/** Davet mailindeki bağlantıdan token'ı çıkarır. */
export function invitationTokenFrom(mail: SendMailInput): string {
  const match = /[?&]token=([^\s&"]+)/.exec(mail.text);
  if (!match) {
    throw new Error('mailde davet bağlantısı yok');
  }
  return decodeURIComponent(match[1]);
}
