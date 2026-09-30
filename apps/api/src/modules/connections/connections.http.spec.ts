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
import { ConnectionController } from './connection.controller';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionStatus, ConnectionType } from './entities/connection.entity';

const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const OTHER_ORG_ID = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_A = '0190f0e4-0000-7000-8000-00000000000c';
const PROJECT_IN_A = '0190f0e4-0000-7000-8000-00000000000e';
const PROJECT_IN_OTHER_ORG = '0190f0e4-0000-7000-8000-000000000010';
const CONNECTION_ID = '0190f0e4-0000-7000-8000-000000000020';

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

  const connectionsService = {
    listByProject: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({
      id: CONNECTION_ID,
      projectId: PROJECT_IN_A,
      type: ConnectionType.Gsc,
      externalId: 'sc-domain:example.com',
      status: ConnectionStatus.Pending,
    }),
    listGscSites: jest.fn().mockResolvedValue([]),
    getServiceAccountEmail: jest.fn().mockReturnValue('sa@example.com'),
    findOne: jest.fn().mockResolvedValue({
      id: CONNECTION_ID,
      projectId: PROJECT_IN_A,
      type: ConnectionType.Gsc,
      externalId: 'sc-domain:example.com',
      status: ConnectionStatus.Pending,
    }),
    verify: jest.fn().mockResolvedValue({
      id: CONNECTION_ID,
      projectId: PROJECT_IN_A,
      type: ConnectionType.Gsc,
      externalId: 'sc-domain:example.com',
      status: ConnectionStatus.Active,
    }),
    delete: jest.fn().mockResolvedValue(undefined),
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
    controllers: [ConnectionsController, ConnectionController],
    providers: [
      { provide: MembershipsService, useValue: membershipsService },
      { provide: ConnectionsService, useValue: connectionsService },
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
    connectionsService,
  };
}

describe('Bağlantı rol matrisi ve endpoint akışı (ARCHITECTURE §5.2, §9)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function call(
    method: 'get' | 'post' | 'delete',
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
    it.each(ALL_ORG_ROLES)(
      'GET /projects/:id/connections dataView: %s görebilir',
      async (role) => {
        const response = await call(
          'get',
          `/projects/${PROJECT_IN_A}/connections`,
          USER_BY_ROLE[role],
        );
        expect(response.status).toBe(200);
      },
    );

    it.each(ALL_ORG_ROLES)(
      'POST /projects/:id/connections connectionManage: yalnız owner/admin',
      async (role) => {
        const response = await call(
          'post',
          `/projects/${PROJECT_IN_A}/connections`,
          USER_BY_ROLE[role],
          ORG_ID,
          { type: 'gsc', externalId: 'sc-domain:example.com' },
        );
        if (
          (ROLE_MATRIX.connectionManage as readonly OrgRole[]).includes(role)
        ) {
          expect(response.status).toBe(201);
        } else {
          expect(response.status).toBe(403);
          expect((response.body as ErrorBody).error.code).toBe(
            'INSUFFICIENT_ROLE',
          );
        }
      },
    );

    it.each(ALL_ORG_ROLES)(
      'POST /connections/:id/verify connectionManage: yalnız owner/admin',
      async (role) => {
        const response = await call(
          'post',
          `/connections/${CONNECTION_ID}/verify`,
          USER_BY_ROLE[role],
        );
        if (
          (ROLE_MATRIX.connectionManage as readonly OrgRole[]).includes(role)
        ) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(403);
        }
      },
    );
  });

  it('GET /connections/service-account service account e-postasını döner', async () => {
    const response = await call(
      'get',
      '/connections/service-account',
      USER_BY_ROLE[OrgRole.Owner],
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ email: 'sa@example.com' });
  });

  it('GET /projects/:id/connections/gsc/sites erişilebilir property listesini döner', async () => {
    const response = await call(
      'get',
      `/projects/${PROJECT_IN_A}/connections/gsc/sites`,
      USER_BY_ROLE[OrgRole.Owner],
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('POST /connections/:id/verify başarılı doğrulamada active connection döner', async () => {
    const response = await call(
      'post',
      `/connections/${CONNECTION_ID}/verify`,
      USER_BY_ROLE[OrgRole.Owner],
    );

    expect(response.status).toBe(200);
    expect((response.body as { status: string }).status).toBe('active');
  });

  it("başka org'un projesinde connection listesi 404 döner (ProjectAccessGuard)", async () => {
    const response = await call(
      'get',
      `/projects/${PROJECT_IN_OTHER_ORG}/connections`,
      USER_BY_ROLE[OrgRole.Owner],
    );

    expect(response.status).toBe(404);
  });

  it('DELETE /connections/:id siler', async () => {
    const response = await call(
      'delete',
      `/connections/${CONNECTION_ID}`,
      USER_BY_ROLE[OrgRole.Owner],
    );

    expect(response.status).toBe(204);
    expect(ctx.connectionsService.delete).toHaveBeenCalled();
  });
});
