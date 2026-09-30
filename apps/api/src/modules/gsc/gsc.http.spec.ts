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
import { GscJobsService } from './gsc-jobs.service';
import { GscQueryService } from './gsc-query.service';
import { GscController } from './gsc.controller';
import { GscConnectionNotActiveError } from './gsc.errors';

const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const OTHER_ORG_ID = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000c';
const PROJECT_IN_A = '0190f0e4-0000-7000-8000-00000000000e';
const PROJECT_IN_OTHER_ORG = '0190f0e4-0000-7000-8000-000000000010';
const RUN_ID = '0190f0e4-0000-7000-8000-000000000099';
const HASH = '900150983cd24fb0d6963f7d28e17f72';

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
  const gscJobs = {
    triggerManualSync: jest.fn().mockResolvedValue(RUN_ID),
  };
  const gscQuery = {
    overview: jest.fn().mockResolvedValue({
      from: '2026-09-01',
      to: '2026-09-28',
      totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      series: [],
      compare: null,
    }),
    queries: jest.fn().mockResolvedValue(emptyPage),
    pages: jest.fn().mockResolvedValue(emptyPage),
    queryPages: jest.fn().mockResolvedValue(emptyPage),
    pageQueries: jest.fn().mockResolvedValue(emptyPage),
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
    controllers: [GscController],
    providers: [
      { provide: MembershipsService, useValue: membershipsService },
      { provide: GscJobsService, useValue: gscJobs },
      { provide: GscQueryService, useValue: gscQuery },
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
    gscJobs,
    gscQuery,
  };
}

describe('GSC endpoint rol matrisi ve doğrulama (PLAN T1.5)', () => {
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

  describe('POST /projects/:id/sync/gsc', () => {
    it.each(ALL_ORG_ROLES)(
      'connectionManage: yalnız owner/admin tetikler (%s)',
      async (role) => {
        const response = await call(
          'post',
          `/projects/${PROJECT_IN_A}/sync/gsc`,
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
      await call('post', `/projects/${PROJECT_IN_A}/sync/gsc`);

      expect(ctx.gscJobs.triggerManualSync).toHaveBeenCalledWith(
        ORG_ID,
        PROJECT_IN_A,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });

    it('aktif bağlantı yoksa 409 GSC_CONNECTION_NOT_ACTIVE', async () => {
      ctx.gscJobs.triggerManualSync.mockRejectedValueOnce(
        new GscConnectionNotActiveError(),
      );

      const response = await call('post', `/projects/${PROJECT_IN_A}/sync/gsc`);

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe(
        'GSC_CONNECTION_NOT_ACTIVE',
      );
    });

    it("başka org'un projesinde 404 (ProjectAccessGuard)", async () => {
      const response = await call(
        'post',
        `/projects/${PROJECT_IN_OTHER_ORG}/sync/gsc`,
      );

      expect(response.status).toBe(404);
      expect(ctx.gscJobs.triggerManualSync).not.toHaveBeenCalled();
    });
  });

  describe('sorgu endpointleri', () => {
    const paths = [
      '/gsc/overview',
      '/gsc/queries',
      '/gsc/pages',
      `/gsc/queries/${HASH}/pages`,
      `/gsc/pages/${HASH}/queries`,
    ];

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

    it('queries query parametrelerini doğrulanmış ve varsayılanlı iletir', async () => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_A}/gsc/queries?from=2026-09-01&to=2026-09-28&search=seo&page=2&limit=100`,
      );

      expect(response.status).toBe(200);
      expect(ctx.gscQuery.queries).toHaveBeenCalledWith(
        PROJECT_IN_A,
        expect.objectContaining({
          from: '2026-09-01',
          to: '2026-09-28',
          search: 'seo',
          page: 2,
          limit: 100,
          sort: 'clicks',
          order: 'desc',
        }),
      );
    });

    it.each([
      ['limit 200 üstü', '/gsc/queries?limit=500'],
      ['geçersiz tarih biçimi', '/gsc/pages?from=01-09-2026'],
      ['geçersiz sort', '/gsc/queries?sort=foo'],
      ['geçersiz compare', '/gsc/overview?compare=week'],
      ['md5 olmayan hash', '/gsc/queries/not-a-hash/pages'],
    ])('%s 400 VALIDATION_ERROR döner', async (_label, path) => {
      const response = await call('get', `/projects/${PROJECT_IN_A}${path}`);

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    });

    it('overview compare parametresini iletir', async () => {
      await call(
        'get',
        `/projects/${PROJECT_IN_A}/gsc/overview?compare=previous`,
      );

      expect(ctx.gscQuery.overview).toHaveBeenCalledWith(PROJECT_IN_A, {
        compare: 'previous',
      });
    });

    it('detay endpointleri hash ile servisi çağırır', async () => {
      await call('get', `/projects/${PROJECT_IN_A}/gsc/queries/${HASH}/pages`);
      await call('get', `/projects/${PROJECT_IN_A}/gsc/pages/${HASH}/queries`);

      expect(ctx.gscQuery.queryPages).toHaveBeenCalledWith(
        PROJECT_IN_A,
        HASH,
        expect.any(Object),
      );
      expect(ctx.gscQuery.pageQueries).toHaveBeenCalledWith(
        PROJECT_IN_A,
        HASH,
        expect.any(Object),
      );
    });
  });
});
