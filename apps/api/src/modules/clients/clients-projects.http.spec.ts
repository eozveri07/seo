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
import { TenantGuard } from '../organizations/guards/tenant.guard';
import { MembershipsService } from '../organizations/memberships.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Project } from './entities/project.entity';
import { ProjectAccessGuard } from './guards/project-access.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * ARCHITECTURE §4.3 zinciri gerçek (JwtAuthGuard → TenantGuard → RolesGuard →
 * ProjectAccessGuard); servisler mock'tur (DB yok). §4.2'de client/proje
 * yönetimi `clientProjectManage`, görüntüleme `dataView`'dır.
 */
const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const OTHER_ORG_ID = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000c';
const CLIENT_B = '0190f0e4-0000-7000-8000-00000000000d';
const PROJECT_IN_A = '0190f0e4-0000-7000-8000-00000000000e';
/** Aynı org'da, ama CLIENT_B'nin projesi (client_viewer scope testi için). */
const PROJECT_IN_B = '0190f0e4-0000-7000-8000-00000000000f';
/** Başka bir org'un projesi (org izolasyon testi için). */
const PROJECT_IN_OTHER_ORG = '0190f0e4-0000-7000-8000-000000000010';

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
  const clientsService = {
    list: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    findOne: jest.fn().mockResolvedValue({ id: CLIENT_A, name: 'A' }),
    create: jest.fn().mockResolvedValue({ id: CLIENT_A, name: 'A' }),
    update: jest.fn().mockResolvedValue({ id: CLIENT_A, name: 'A' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const projectsService = {
    list: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    findOne: jest
      .fn()
      .mockResolvedValue({ id: PROJECT_IN_A, clientId: CLIENT_A }),
    create: jest
      .fn()
      .mockResolvedValue({ id: PROJECT_IN_A, clientId: CLIENT_A }),
    update: jest
      .fn()
      .mockResolvedValue({ id: PROJECT_IN_A, clientId: CLIENT_A }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const projectRows = [
    { id: PROJECT_IN_A, orgId: ORG_ID, clientId: CLIENT_A },
    { id: PROJECT_IN_B, orgId: ORG_ID, clientId: CLIENT_B },
    { id: PROJECT_IN_OTHER_ORG, orgId: OTHER_ORG_ID, clientId: CLIENT_B },
  ];
  const clsRef: { current?: ClsService<AppClsStore> } = {};
  /**
   * `ProjectAccessGuard`'ın kullandığı repository sahtesi: gerçek
   * `TenantRepository` gibi yalnız CLS'teki (`TenantGuard`'ın yazdığı) org'un
   * projesini döner.
   */
  const projectsRepository = {
    findOneBy: jest.fn(({ id }: { id: string }) => {
      const orgId = clsRef.current?.get('orgId');
      const row = projectRows.find((r) => r.id === id && r.orgId === orgId);
      return Promise.resolve(row ? ({ ...row } as Project) : null);
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
    controllers: [ClientsController, ProjectsController],
    providers: [
      { provide: MembershipsService, useValue: membershipsService },
      { provide: ClientsService, useValue: clientsService },
      { provide: ProjectsService, useValue: projectsService },
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
    clientsService,
    projectsService,
  };
}

describe('Client/proje rol matrisi ve ProjectAccessGuard (ARCHITECTURE §4.2, §4.3)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    userId: string,
    orgId = ORG_ID,
    body?: object,
  ) {
    const req = request(ctx.app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${ctx.token(userId)}`)
      .set('X-Org-Id', orgId);
    return body ? req.send(body) : req;
  }

  describe('rol matrisi', () => {
    const readEndpoints: { method: 'get'; path: string }[] = [
      { method: 'get', path: '/clients' },
      { method: 'get', path: `/clients/${CLIENT_A}` },
      { method: 'get', path: '/projects' },
      { method: 'get', path: `/projects/${PROJECT_IN_A}` },
    ];
    const writeEndpoints: {
      method: 'post' | 'patch' | 'delete';
      path: string;
      body?: object;
    }[] = [
      { method: 'post', path: '/clients', body: { name: 'Yeni Client' } },
      {
        method: 'patch',
        path: `/clients/${CLIENT_A}`,
        body: { name: 'Yeni ad' },
      },
      { method: 'delete', path: `/clients/${CLIENT_A}` },
      {
        method: 'post',
        path: '/projects',
        body: {
          clientId: CLIENT_A,
          name: 'Yeni Proje',
          domain: 'example.com',
        },
      },
      {
        method: 'patch',
        path: `/projects/${PROJECT_IN_A}`,
        body: { name: 'Yeni ad' },
      },
      { method: 'delete', path: `/projects/${PROJECT_IN_A}` },
    ];

    it.each(
      readEndpoints.flatMap((endpoint) =>
        ALL_ORG_ROLES.map((role) => [endpoint, role] as const),
      ),
    )('%s dataView: her rol görebilir', async (endpoint, role) => {
      const response = await call(
        endpoint.method,
        endpoint.path,
        USER_BY_ROLE[role],
      );
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    });

    it.each(
      writeEndpoints.flatMap((endpoint) =>
        ALL_ORG_ROLES.map((role) => [endpoint, role] as const),
      ),
    )(
      '%s clientProjectManage: yalnız owner/admin, diğerleri 403',
      async (endpoint, role) => {
        const response = await call(
          endpoint.method,
          endpoint.path,
          USER_BY_ROLE[role],
          ORG_ID,
          endpoint.body,
        );
        if (
          (ROLE_MATRIX.clientProjectManage as readonly OrgRole[]).includes(role)
        ) {
          expect(response.status).toBeGreaterThanOrEqual(200);
          expect(response.status).toBeLessThan(300);
        } else {
          expect(response.status).toBe(403);
          expect((response.body as ErrorBody).error.code).toBe(
            'INSUFFICIENT_ROLE',
          );
        }
      },
    );
  });

  describe('ProjectAccessGuard', () => {
    it("başka org'un projesinde (org kapsamı dışında) 404 döner", async () => {
      const before = ctx.projectsService.findOne.mock.calls.length;

      const response = await call(
        'get',
        `/projects/${PROJECT_IN_OTHER_ORG}`,
        USER_BY_ROLE[OrgRole.Admin],
      );

      expect(response.status).toBe(404);
      expect(ctx.projectsService.findOne).toHaveBeenCalledTimes(before);
    });

    it('olmayan bir projede 404 döner', async () => {
      const response = await call(
        'get',
        `/projects/0190f0e4-0000-7000-8000-0000000000ff`,
        USER_BY_ROLE[OrgRole.Admin],
      );

      expect(response.status).toBe(404);
    });

    it("client_viewer kendi client'ının projesini görebilir", async () => {
      const response = await call(
        'get',
        `/projects/${PROJECT_IN_A}`,
        USER_BY_ROLE[OrgRole.ClientViewer],
      );

      expect(response.status).toBe(200);
    });

    it("client_viewer başka client'ın projesine 404 alır (varlığı sızdırmaz)", async () => {
      const before = ctx.projectsService.findOne.mock.calls.length;

      const response = await call(
        'get',
        `/projects/${PROJECT_IN_B}`,
        USER_BY_ROLE[OrgRole.ClientViewer],
      );

      expect(response.status).toBe(404);
      expect(ctx.projectsService.findOne).toHaveBeenCalledTimes(before);
    });

    it(':projectId içermeyen /projects listesine dokunmaz', async () => {
      const response = await call(
        'get',
        '/projects',
        USER_BY_ROLE[OrgRole.Admin],
      );

      expect(response.status).toBe(200);
    });
  });
});
