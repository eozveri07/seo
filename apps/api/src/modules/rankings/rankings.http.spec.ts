import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { TrackedKeywordNotFoundError } from '../keywords/keywords.errors';
import { RankJobsService } from './rank-jobs.service';
import { RankingsQueryService } from './rankings-query.service';
import { RankingsController } from './rankings.controller';
import { RankResultNotFoundError } from './rankings.errors';

const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const OTHER_ORG_ID = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000c';
const PROJECT_IN_A = '0190f0e4-0000-7000-8000-00000000000e';
const PROJECT_IN_OTHER_ORG = '0190f0e4-0000-7000-8000-000000000010';
const RUN_ID = '0190f0e4-0000-7000-8000-000000000099';
const KEYWORD_ID = '0190f0e4-0000-7000-8000-0000000000c1';
const KEYWORD_ID_2 = '0190f0e4-0000-7000-8000-0000000000c2';

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

  const rankJobs = {
    triggerCheckNow: jest.fn().mockResolvedValue(RUN_ID),
  };
  const rankingsQuery = {
    history: jest.fn().mockResolvedValue({
      from: '2026-09-01',
      to: '2026-09-30',
      keywords: [],
    }),
    serp: jest.fn().mockResolvedValue({
      trackedKeywordId: KEYWORD_ID,
      date: '2026-09-30',
      position: 3,
      rankAbsolute: 6,
      url: 'https://example.com/',
      serpFeatures: [],
      competitorsTop: [],
      checkedAt: new Date('2026-09-30T04:05:00Z'),
      source: 'dfs_standard',
    }),
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
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 20 }],
      }),
      JwtModule.register({
        secret: SECRET,
        signOptions: { algorithm: 'HS256', expiresIn: 900 },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    ],
    controllers: [RankingsController],
    providers: [
      { provide: MembershipsService, useValue: membershipsService },
      { provide: RankJobsService, useValue: rankJobs },
      { provide: RankingsQueryService, useValue: rankingsQuery },
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
    rankJobs,
    rankingsQuery,
  };
}

function caller(ctx: Awaited<ReturnType<typeof createApp>>) {
  return (
    method: 'get' | 'post',
    path: string,
    userId: string = USER_BY_ROLE[OrgRole.Owner],
  ) =>
    request(ctx.app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${ctx.token(userId)}`)
      .set('X-Org-Id', ORG_ID);
}

const CHECK_NOW = `/projects/${PROJECT_IN_A}/keywords/${KEYWORD_ID}/check-now`;

describe('Rank endpoint rol matrisi ve doğrulama (PLAN T1.9)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let call: ReturnType<typeof caller>;

  beforeAll(async () => {
    ctx = await createApp();
    call = caller(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /projects/:id/keywords/:kid/check-now', () => {
    it.each(ALL_ORG_ROLES)(
      'contentManage: owner/admin/analyst tetikler, 202 runId döner (%s)',
      async (role) => {
        const response = await call('post', CHECK_NOW, USER_BY_ROLE[role]);
        if ((ROLE_MATRIX.contentManage as readonly OrgRole[]).includes(role)) {
          expect(response.status).toBe(202);
          expect(response.body).toEqual({ runId: RUN_ID });
        } else {
          expect(response.status).toBe(403);
        }
      },
    );

    it("org'u X-Org-Id'den, günü UTC'den alır", async () => {
      await call('post', CHECK_NOW, USER_BY_ROLE[OrgRole.Admin]);

      expect(ctx.rankJobs.triggerCheckNow).toHaveBeenCalledWith(
        ORG_ID,
        PROJECT_IN_A,
        KEYWORD_ID,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });

    it('keyword projede yoksa 404 TRACKED_KEYWORD_NOT_FOUND', async () => {
      ctx.rankJobs.triggerCheckNow.mockRejectedValueOnce(
        new TrackedKeywordNotFoundError(),
      );

      const response = await call(
        'post',
        CHECK_NOW,
        USER_BY_ROLE[OrgRole.Admin],
      );

      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).error.code).toBe(
        'TRACKED_KEYWORD_NOT_FOUND',
      );
    });

    it("başka org'un projesinde 404 (ProjectAccessGuard)", async () => {
      const response = await call(
        'post',
        `/projects/${PROJECT_IN_OTHER_ORG}/keywords/${KEYWORD_ID}/check-now`,
      );

      expect(response.status).toBe(404);
      expect(ctx.rankJobs.triggerCheckNow).not.toHaveBeenCalled();
    });
  });

  describe('GET rankings/history', () => {
    it('virgülle ayrılmış ve tekrar eden keywordIds kabul edilir', async () => {
      const comma = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/history?keywordIds=${KEYWORD_ID},${KEYWORD_ID_2}&from=2026-09-01&to=2026-09-30`,
        USER_BY_ROLE[OrgRole.ClientViewer],
      );
      const repeated = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/history?keywordIds=${KEYWORD_ID}&keywordIds=${KEYWORD_ID_2}`,
      );

      expect(comma.status).toBe(200);
      expect(repeated.status).toBe(200);
      expect(ctx.rankingsQuery.history).toHaveBeenNthCalledWith(
        1,
        PROJECT_IN_A,
        expect.objectContaining({
          keywordIds: [KEYWORD_ID, KEYWORD_ID_2],
          from: '2026-09-01',
          to: '2026-09-30',
        }),
      );
      expect(ctx.rankingsQuery.history).toHaveBeenNthCalledWith(
        2,
        PROJECT_IN_A,
        expect.objectContaining({ keywordIds: [KEYWORD_ID, KEYWORD_ID_2] }),
      );
    });

    it.each([
      ['keywordIds yok', ''],
      ['uuid olmayan keywordIds', '?keywordIds=abc'],
      ['geçersiz tarih', `?keywordIds=${KEYWORD_ID}&from=01-09-2026`],
    ])('%s: 400 VALIDATION_ERROR', async (_name, query) => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/history${query}`,
      );

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
      expect(ctx.rankingsQuery.history).not.toHaveBeenCalled();
    });

    it("başka org'un projesinde 404", async () => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_OTHER_ORG}/rankings/history?keywordIds=${KEYWORD_ID}`,
      );
      expect(response.status).toBe(404);
    });
  });

  describe('GET rankings/serp/:kid', () => {
    it('tüm roller görür; date opsiyonel', async () => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/serp/${KEYWORD_ID}?date=2026-09-30`,
        USER_BY_ROLE[OrgRole.ClientViewer],
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ position: 3, rankAbsolute: 6 });
      expect(ctx.rankingsQuery.serp).toHaveBeenCalledWith(
        PROJECT_IN_A,
        KEYWORD_ID,
        '2026-09-30',
      );
    });

    it('sonuç yoksa 404 RANK_RESULT_NOT_FOUND', async () => {
      ctx.rankingsQuery.serp.mockRejectedValueOnce(
        new RankResultNotFoundError(),
      );

      const response = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/serp/${KEYWORD_ID}`,
      );

      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).error.code).toBe(
        'RANK_RESULT_NOT_FOUND',
      );
    });

    it('geçersiz keyword id ya da tarih 400', async () => {
      const badId = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/serp/abc`,
      );
      const badDate = await call(
        'get',
        `/projects/${PROJECT_IN_A}/rankings/serp/${KEYWORD_ID}?date=bugun`,
      );
      expect(badId.status).toBe(400);
      expect(badDate.status).toBe(400);
    });
  });
});

describe('check-now kullanıcı başına rate limit', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;
  let call: ReturnType<typeof caller>;

  beforeAll(async () => {
    ctx = await createApp();
    call = caller(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('aynı kullanıcı dakikada 5 istekten sonra 429 alır; başka kullanıcı etkilenmez', async () => {
    const owner = USER_BY_ROLE[OrgRole.Owner];
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await call('post', CHECK_NOW, owner)).status);
    }

    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
    expect(ctx.rankJobs.triggerCheckNow).toHaveBeenCalledTimes(5);

    const admin = await call('post', CHECK_NOW, USER_BY_ROLE[OrgRole.Admin]);
    expect(admin.status).toBe(202);
  });

  it('limit yalnız check-now içindir; sorgu endpointleri etkilenmez', async () => {
    const response = await call(
      'get',
      `/projects/${PROJECT_IN_A}/rankings/serp/${KEYWORD_ID}`,
    );
    expect(response.status).toBe(200);
  });
});
