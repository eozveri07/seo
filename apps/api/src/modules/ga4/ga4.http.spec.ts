import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppClsStore } from '../../common/cls-store';
import { RequestContextModule } from '../../common/cls.module';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import {
  ALL_ORG_ROLES,
  OrgRole,
  ROLE_MATRIX,
} from '../../common/tenancy/org-role';
import { RolesGuard } from '../../common/tenancy/roles.guard';
import { getTenantRepositoryToken } from '../../common/tenancy/tenant-repository.provider';
import { configureApp } from '../../configure-app';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectAccessGuard } from '../clients/guards/project-access.guard';
import { Project } from '../clients/entities/project.entity';
import { TenantGuard } from '../organizations/guards/tenant.guard';
import { MembershipsService } from '../organizations/memberships.service';
import { Ga4JobsService } from './ga4-jobs.service';
import { Ga4QueryService } from './ga4-query.service';
import { Ga4Controller } from './ga4.controller';
import { Ga4ConnectionNotActiveError } from './ga4.errors';

const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const OTHER_ORG_ID = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000c';
const PROJECT_IN_A = '0190f0e4-0000-7000-8000-00000000000e';
const PROJECT_IN_OTHER_ORG = '0190f0e4-0000-7000-8000-000000000010';
const RUN_ID = '0190f0e4-0000-7000-8000-000000000099';

const USER_BY_ROLE: Record<OrgRole, string> = {
  [OrgRole.Owner]: '0190f0e4-0000-7000-8000-0000000000a1',
  [OrgRole.Admin]: '0190f0e4-0000-7000-8000-0000000000a2',
  [OrgRole.Analyst]: '0190f0e4-0000-7000-8000-0000000000a3',
  [OrgRole.ClientViewer]: '0190f0e4-0000-7000-8000-0000000000a4',
};

interface ErrorBody {
  error: { code: string };
}

async function createApp() {
  const membershipsService = {
    resolve: jest.fn((orgId: string, userId: string) => {
      if (orgId !== ORG_ID) return Promise.resolve(undefined);
      const role = (Object.keys(USER_BY_ROLE) as OrgRole[]).find(
        (key) => USER_BY_ROLE[key] === userId,
      );
      return Promise.resolve(
        role
          ? { role, clientId: role === OrgRole.ClientViewer ? CLIENT_A : null }
          : undefined,
      );
    }),
  };

  const emptyPage = { items: [], total: 0, page: 1, limit: 50 };
  const ga4Jobs = {
    triggerManualSync: jest.fn().mockResolvedValue(RUN_ID),
  };
  const ga4Query = {
    overview: jest.fn().mockResolvedValue({
      from: '2026-09-01',
      to: '2026-09-28',
      totals: {
        sessions: 0,
        engagedSessions: 0,
        keyEvents: 0,
        totalRevenue: 0,
      },
      channels: [],
    }),
    landingPages: jest.fn().mockResolvedValue(emptyPage),
  };

  const projectRows = [
    { id: PROJECT_IN_A, orgId: ORG_ID, clientId: CLIENT_A },
    { id: PROJECT_IN_OTHER_ORG, orgId: OTHER_ORG_ID, clientId: CLIENT_A },
  ];
  const clsRef: { current?: ClsService<AppClsStore> } = {};
  const projectsRepository = {
    findOneBy: jest.fn(({ id }: { id: string }) => {
      const orgId = clsRef.current?.get('orgId');
      const row = projectRows.find((r) => r.id === id && r.orgId === orgId);
      return Promise.resolve(row ? { ...row } : null);
    }),
  };

  const env: Record<string, unknown> = {
    NODE_ENV: 'test',
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
    ],
    controllers: [Ga4Controller],
    providers: [
      { provide: MembershipsService, useValue: membershipsService },
      { provide: Ga4JobsService, useValue: ga4Jobs },
      { provide: Ga4QueryService, useValue: ga4Query },
      {
        provide: getTenantRepositoryToken(Project),
        useValue: projectsRepository,
      },
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      // AppModule'deki sırayla: JwtAuthGuard → TenantGuard → RolesGuard → ProjectAccessGuard
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: TenantGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: ProjectAccessGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  clsRef.current = moduleRef.get(ClsService);

  const jwt = moduleRef.get(JwtService);
  return {
    app: app as INestApplication<App>,
    token: (userId: string) => jwt.sign({ sub: userId }),
    ga4Jobs,
    ga4Query,
  };
}

describe('GA4 endpoint rol matrisi ve doğrulama (PLAN T1.6)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function call(
    method: 'get' | 'post',
    path: string,
    userId: string = USER_BY_ROLE[OrgRole.Owner],
  ) {
    return request(ctx.app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${ctx.token(userId)}`)
      .set('X-Org-Id', ORG_ID);
  }

  describe('POST /projects/:id/sync/ga4', () => {
    it.each(ALL_ORG_ROLES)(
      'connectionManage: yalnız owner/admin tetikler (%s)',
      async (role) => {
        const response = await call(
          'post',
          `/projects/${PROJECT_IN_A}/sync/ga4`,
          USER_BY_ROLE[role],
        );
        if (
          (ROLE_MATRIX.connectionManage as readonly OrgRole[]).includes(role)
        ) {
          expect(response.status).toBe(202);
          expect(response.body).toEqual({ runId: RUN_ID });
        } else {
          expect(response.status).toBe(403);
        }
      },
    );

    it("org'u X-Org-Id'den, günü UTC'den alır", async () => {
      await call('post', `/projects/${PROJECT_IN_A}/sync/ga4`);

      expect(ctx.ga4Jobs.triggerManualSync).toHaveBeenCalledWith(
        ORG_ID,
        PROJECT_IN_A,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });

    it('aktif bağlantı yoksa 409 GA4_CONNECTION_NOT_ACTIVE', async () => {
      ctx.ga4Jobs.triggerManualSync.mockRejectedValueOnce(
        new Ga4ConnectionNotActiveError(),
      );

      const response = await call('post', `/projects/${PROJECT_IN_A}/sync/ga4`);

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe(
        'GA4_CONNECTION_NOT_ACTIVE',
      );
    });

    it("başka org'un projesinde 404 (ProjectAccessGuard)", async () => {
      const response = await call(
        'post',
        `/projects/${PROJECT_IN_OTHER_ORG}/sync/ga4`,
      );

      expect(response.status).toBe(404);
      expect(ctx.ga4Jobs.triggerManualSync).not.toHaveBeenCalled();
    });
  });

  describe('sorgu endpointleri', () => {
    const paths = ['/ga4/overview', '/ga4/landing-pages'];

    it.each(paths.flatMap((path) => ALL_ORG_ROLES.map((role) => [path, role])))(
      '%s dataView: %s görebilir',
      async (path, role) => {
        const response = await call(
          'get',
          `/projects/${PROJECT_IN_A}${path}`,
          USER_BY_ROLE[role as OrgRole],
        );

        expect(response.status).toBe(200);
      },
    );

    it.each(paths)("%s başka org'un projesinde 404", async (path) => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_OTHER_ORG}${path}`,
      );

      expect(response.status).toBe(404);
    });

    it('landing-pages query parametrelerini doğrulanmış ve varsayılanlı iletir', async () => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_A}/ga4/landing-pages?from=2026-09-01&to=2026-09-28&channel=Organic Search&page=2&limit=100`,
      );

      expect(response.status).toBe(200);
      expect(ctx.ga4Query.landingPages).toHaveBeenCalledWith(
        PROJECT_IN_A,
        expect.objectContaining({
          from: '2026-09-01',
          to: '2026-09-28',
          channel: 'Organic Search',
          page: 2,
          limit: 100,
          sort: 'sessions',
          order: 'desc',
        }),
      );
    });

    it.each([
      ['limit 200 üstü', '/ga4/landing-pages?limit=500'],
      ['geçersiz tarih biçimi', '/ga4/landing-pages?from=01-09-2026'],
      ['geçersiz sort', '/ga4/landing-pages?sort=foo'],
    ])('%s 400 VALIDATION_ERROR döner', async (_label, path) => {
      const response = await call('get', `/projects/${PROJECT_IN_A}${path}`);

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
