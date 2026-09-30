import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabasePingService } from '../src/infra/database-ping/database-ping.service';
import { RedisPingService } from '../src/infra/redis/redis-ping.service';
import { ValidationTestModule } from './fixtures/validation-test.module';

interface HealthBody {
  status: 'ok' | 'error';
  checks: {
    database: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    redis: { status: 'up' | 'down'; latencyMs?: number; error?: string };
  };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let databasePing: { ping: jest.Mock };
  let redisPing: { ping: jest.Mock };

  beforeEach(async () => {
    databasePing = {
      ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
    };
    redisPing = {
      ping: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, ValidationTestModule],
    })
      .overrideProvider(DatabasePingService)
      .useValue(databasePing)
      .overrideProvider(RedisPingService)
      .useValue(redisPing)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app as unknown as NestExpressApplication);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('DB ve Redis up ise 200 ve status=ok döner', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        checks: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      });
    });

    it('DB down ise 503 ve status=error döner', async () => {
      databasePing.ping.mockResolvedValueOnce({
        status: 'down',
        error: 'DATABASE_UNAVAILABLE',
      });

      const response = await request(app.getHttpServer()).get('/api/v1/health');
      const body = response.body as HealthBody;

      expect(response.status).toBe(503);
      expect(body.status).toBe('error');
      expect(body.checks.database).toEqual({
        status: 'down',
        error: 'DATABASE_UNAVAILABLE',
      });
      expect(body.checks.redis.status).toBe('up');
    });

    it('Redis down ise 503 ve status=error döner', async () => {
      redisPing.ping.mockResolvedValueOnce({
        status: 'down',
        error: 'REDIS_UNAVAILABLE',
      });

      const response = await request(app.getHttpServer()).get('/api/v1/health');
      const body = response.body as HealthBody;

      expect(response.status).toBe(503);
      expect(body.status).toBe('error');
      expect(body.checks.redis).toEqual({
        status: 'down',
        error: 'REDIS_UNAVAILABLE',
      });
    });

    it('response X-Request-Id header içerir', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('gelen X-Request-Id header değeri response içinde korunur', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Request-Id', 'test-request-id-123');

      expect(response.headers['x-request-id']).toBe('test-request-id-123');
    });
  });

  describe('ValidationPipe', () => {
    it('geçersiz ve fazladan alan içeren body 400 ve standart hata gövdesi döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-validation')
        .send({ email: 'not-an-email', name: 'ok', extra: 'fazladan alan' });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBeDefined();
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details?.length).toBeGreaterThan(0);
    });

    it('geçerli body 201 döner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-validation')
        .send({ email: 'user@example.com', name: 'ok' });

      expect(response.status).toBe(201);
    });
  });
});
