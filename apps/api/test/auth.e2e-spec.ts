import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { hashRefreshToken } from '../src/modules/auth/refresh-token.service';

/**
 * PLAN.md T1.1 e2e: login → refresh → eski refresh token'ı tekrar kullanma →
 * ailenin iptali → logout. Gerçek, migration'ları uygulanmış bir test
 * veritabanı ister; `users` ve `refresh_tokens` her testten önce boşaltılır.
 *
 *   E2E_DATABASE=true \
 *   DATABASE_URL=postgres://seo:seo@localhost:5432/seo_test \
 *   DATABASE_SKIP_INITIALIZATION=false \
 *   bun run --filter api test:e2e
 *
 * Throttle sayaçları burada bellek içi tutulur (Redis gerekmez); Redis
 * storage'ın kendisi unit testlerde doğrulanır.
 */
const describeWithDatabase =
  process.env.E2E_DATABASE === 'true' ? describe : describe.skip;

interface AuthBody {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: { id: string; email: string };
}

interface ErrorBody {
  error: { code: string; message: string };
}

const OWNER = {
  email: 'Owner@Example.com',
  name: 'Owner',
  password: 'cok-gizli-sifre-123',
};

function refreshCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) {
    throw new Error('refresh_token cookie yok');
  }
  return cookie.split(';')[0];
}

describeWithDatabase('Auth (e2e, test DB)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue(new ThrottlerStorageService())
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app as unknown as NestExpressApplication);
    await app.init();
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE "refresh_tokens", "users" CASCADE');
  });

  afterAll(async () => {
    await app?.close();
  });

  async function registerOwner(): Promise<request.Response> {
    const response = await http().post('/api/v1/auth/register').send(OWNER);
    expect(response.status).toBe(201);
    return response;
  }

  async function login(): Promise<request.Response> {
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email: OWNER.email, password: OWNER.password });
    expect(response.status).toBe(200);
    return response;
  }

  it('ilk kullanıcı kaydolur, ikinci kayıt REGISTRATION_CLOSED alır', async () => {
    const first = await registerOwner();
    expect((first.body as AuthBody).user.email).toBe('owner@example.com');

    const second = await http()
      .post('/api/v1/auth/register')
      .send({ ...OWNER, email: 'baska@example.com' });

    expect(second.status).toBe(403);
    expect((second.body as ErrorBody).error.code).toBe('REGISTRATION_CLOSED');
  });

  it('şifre argon2id ile saklanır', async () => {
    await registerOwner();

    const [row] = await dataSource.query<{ password_hash: string }[]>(
      'SELECT password_hash FROM users',
    );

    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
  });

  it('yanlış şifre ve bilinmeyen e-posta aynı genel hatayı döner', async () => {
    await registerOwner();

    const wrongPassword = await http()
      .post('/api/v1/auth/login')
      .send({ email: OWNER.email, password: 'yanlis-sifre' });
    const unknownEmail = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'yok@example.com', password: 'yanlis-sifre' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect((wrongPassword.body as ErrorBody).error.code).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('login → refresh → eski token tekrar → ailenin iptali → logout', async () => {
    await registerOwner();

    // login: access token ile /me açılır
    const loginResponse = await login();
    const firstRefresh = refreshCookie(loginResponse);
    const { accessToken } = loginResponse.body as AuthBody;
    const me = await http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect((me.body as { email: string }).email).toBe('owner@example.com');
    expect(await http().get('/api/v1/me')).toHaveProperty('status', 401);

    // refresh: yeni refresh token ve yeni access token
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstRefresh);
    expect(refreshed.status).toBe(200);
    const secondRefresh = refreshCookie(refreshed);
    expect(secondRefresh).not.toBe(firstRefresh);
    expect((refreshed.body as AuthBody).accessToken).toBeTruthy();

    // eski token tekrar kullanılınca reddedilir...
    const reused = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstRefresh);
    expect(reused.status).toBe(401);
    expect((reused.body as ErrorBody).error.code).toBe('INVALID_REFRESH_TOKEN');

    // ...ve ailenin tamamı iptal edilir: en yeni token da artık geçersiz
    const afterReuse = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondRefresh);
    expect(afterReuse.status).toBe(401);
    const family = await dataSource.query<{ revoked_at: Date | null }[]>(
      `SELECT revoked_at FROM refresh_tokens
       WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
      [hashRefreshToken(firstRefresh.split('=')[1])],
    );
    expect(family).toHaveLength(2);
    expect(family.every((row) => row.revoked_at !== null)).toBe(true);

    // yeni login yeni aile açar; logout onu iptal eder
    const secondLogin = await login();
    const thirdRefresh = refreshCookie(secondLogin);
    const logout = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', thirdRefresh);
    expect(logout.status).toBe(204);
    const afterLogout = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', thirdRefresh);
    expect(afterLogout.status).toBe(401);
  });

  it('aynı token ile eşzamanlı iki refresh’ten yalnız biri başarılı olur', async () => {
    await registerOwner();
    const cookie = refreshCookie(await login());

    const responses = await Promise.all([
      http().post('/api/v1/auth/refresh').set('Cookie', cookie),
      http().post('/api/v1/auth/refresh').set('Cookie', cookie),
    ]);

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
  });
});
