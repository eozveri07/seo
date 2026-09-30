import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequestContextModule } from '../../common/cls.module';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { configureApp } from '../../configure-app';
import { Environment } from '../../config/environment-variables';
import { MeController } from '../users/me.controller';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AUTH_DEFAULT_THROTTLE } from './auth-throttle';
import { AuthController } from './auth.controller';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from './auth.errors';
import { AuthService, AuthSession } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Auth HTTP katmanı: global JwtAuthGuard, @Public(), cookie nitelikleri,
 * hata gövdeleri ve throttle limitleri. Servisler mock'tur; DB ve Redis yok
 * (throttler burada bellek içi storage ile çalışır).
 */
const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const USER: User = {
  id: '0190f0e4-0000-7000-8000-0000000000a1',
  email: 'owner@example.com',
  name: 'Owner',
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
} as User;

interface ErrorBody {
  error: { code: string };
}

function session(token = 'opaque-refresh-token'): AuthSession {
  return {
    accessToken: 'access.jwt.token',
    expiresIn: 900,
    user: { ...USER, passwordHash: '$argon2id$gizli' } as User,
    refreshToken: {
      token,
      userId: USER.id,
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  };
}

function cookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? (header as string[]) : [];
}

async function createApp(nodeEnv: Environment) {
  const authService = {
    register: jest.fn().mockResolvedValue(session()),
    login: jest.fn().mockResolvedValue(session()),
    refresh: jest.fn().mockResolvedValue(session('rotated-token')),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const usersService = { findById: jest.fn().mockResolvedValue(USER) };
  const env: Record<string, unknown> = {
    NODE_ENV: nodeEnv,
    API_PREFIX: '/api/v1',
    PANEL_ORIGIN: 'http://localhost:5173',
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      RequestContextModule,
      JwtModule.register({
        secret: SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: 900 },
        verifyOptions: { algorithms: ['HS256'] },
      }),
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ...AUTH_DEFAULT_THROTTLE }],
      }),
    ],
    controllers: [AuthController, MeController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: UsersService, useValue: usersService },
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();

  return {
    app: app as INestApplication<App>,
    authService,
    usersService,
    jwtService: moduleRef.get(JwtService),
  };
}

describe('Auth HTTP', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    ctx = await createApp(Environment.Production);
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());

  describe('POST /auth/login', () => {
    it('access token döner, refresh token’ı yalnız httpOnly cookie’ye yazar', async () => {
      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'owner@example.com', password: 'dogru-sifre' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: 'access.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: USER.id,
          email: USER.email,
          name: USER.name,
          lastLoginAt: null,
          createdAt: USER.createdAt.toISOString(),
        },
      });
      expect(response.text).not.toContain('opaque-refresh-token');
      expect(response.text).not.toContain('argon2');

      const [cookie] = cookies(response);
      expect(cookie).toMatch(/^refresh_token=opaque-refresh-token;/);
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Secure');
      expect(cookie).toMatch(/Expires=/);
    });

    it('bearer token olmadan erişilebilir (@Public)', async () => {
      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'owner@example.com', password: 'x' });

      expect(response.status).not.toBe(401);
    });

    it('INVALID_CREDENTIALS 401 ve genel hata gövdesi döner', async () => {
      ctx.authService.login.mockRejectedValue(new InvalidCredentialsError());

      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'owner@example.com', password: 'yanlis' });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.code).toBe(
        'INVALID_CREDENTIALS',
      );
      expect(cookies(response)).toHaveLength(0);
    });

    it('IP başına dakikada 5 denemeden sonra 429 döner', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const response = await http()
          .post('/api/v1/auth/login')
          .send({ email: 'owner@example.com', password: 'x' });
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
    });
  });

  describe('POST /auth/refresh', () => {
    it('cookie’deki token ile rotation yapar ve yeni cookie yazar', async () => {
      const response = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refresh_token=opaque-refresh-token');

      expect(response.status).toBe(200);
      expect(ctx.authService.refresh).toHaveBeenCalledWith(
        'opaque-refresh-token',
        expect.objectContaining({ ip: expect.any(String) as string }),
      );
      expect(cookies(response)[0]).toMatch(/^refresh_token=rotated-token;/);
      expect(response.text).not.toContain('rotated-token');
    });

    it('geçersiz token’da 401 döner ve cookie’yi siler', async () => {
      ctx.authService.refresh.mockRejectedValue(new InvalidRefreshTokenError());

      const response = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refresh_token=eski');

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.code).toBe(
        'INVALID_REFRESH_TOKEN',
      );
      const [cookie] = cookies(response);
      expect(cookie).toMatch(/^refresh_token=;/);
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('IP başına dakikada 10 denemeden sonra 429 döner', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const response = await http()
          .post('/api/v1/auth/refresh')
          .set('Cookie', 'refresh_token=t');
        statuses.push(response.status);
      }

      expect(statuses.filter((s) => s === 200)).toHaveLength(10);
      expect(statuses[10]).toBe(429);
    });
  });

  describe('POST /auth/logout', () => {
    it('aileyi iptal ettirir, cookie’yi siler ve 204 döner', async () => {
      const response = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', 'refresh_token=opaque-refresh-token');

      expect(response.status).toBe(204);
      expect(ctx.authService.logout).toHaveBeenCalledWith(
        'opaque-refresh-token',
      );
      expect(cookies(response)[0]).toMatch(
        /^refresh_token=;.*Path=\/api\/v1\/auth/,
      );
    });
  });

  describe('POST /auth/register', () => {
    it('geçersiz body 400 VALIDATION_ERROR döner', async () => {
      const response = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'x', name: '', password: 'kisa' });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    });

    it('201 ve refresh cookie döner', async () => {
      const response = await http().post('/api/v1/auth/register').send({
        email: 'owner@example.com',
        name: 'Owner',
        password: 'uzun-sifre',
      });

      expect(response.status).toBe(201);
      expect(cookies(response)[0]).toMatch(/^refresh_token=/);
    });
  });

  describe('GET /me (global JwtAuthGuard)', () => {
    it('token yoksa 401 UNAUTHORIZED', async () => {
      const response = await http().get('/api/v1/me');

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
    });

    it('imzası geçersiz token 401', async () => {
      const forged = await new JwtService({ secret: 'baska-secret' }).signAsync(
        {
          sub: USER.id,
        },
      );

      const response = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${forged}`);

      expect(response.status).toBe(401);
    });

    it('süresi dolmuş token 401', async () => {
      const expired = await ctx.jwtService.signAsync(
        { sub: USER.id },
        { expiresIn: -10 },
      );

      const response = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${expired}`);

      expect(response.status).toBe(401);
    });

    it('geçerli token ile kullanıcıyı döner', async () => {
      const token = await ctx.jwtService.signAsync({ sub: USER.id });

      const response = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: USER.id, email: USER.email });
      expect(ctx.usersService.findById).toHaveBeenCalledWith(USER.id);
    });

    it('kullanıcı pasifse 401', async () => {
      ctx.usersService.findById.mockResolvedValue({ ...USER, isActive: false });
      const token = await ctx.jwtService.signAsync({ sub: USER.id });

      const response = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });
  });
});

describe('Auth HTTP (development)', () => {
  it('development’ta refresh cookie Secure değildir', async () => {
    const ctx = await createApp(Environment.Development);
    try {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'owner@example.com', password: 'x' });

      const [cookie] = cookies(response);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure');
    } finally {
      await ctx.app.close();
    }
  });
});
