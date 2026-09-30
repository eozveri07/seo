import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequestContextModule } from '../../common/cls.module';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import {
  ALL_ORG_ROLES,
  OrgRole,
  ROLE_MATRIX,
} from '../../common/tenancy/org-role';
import { RolesGuard } from '../../common/tenancy/roles.guard';
import { configureApp } from '../../configure-app';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from './guards/tenant.guard';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembersController } from './members.controller';
import { MembershipsService } from './memberships.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * ARCHITECTURE §4.2 rol matrisi: JwtAuthGuard → TenantGuard → RolesGuard
 * zinciri gerçek, servisler mock'tur (DB ve Redis yok). Her endpoint her
 * rolle çağrılır; matrisin izin verdiği roller 2xx, diğerleri 403
 * INSUFFICIENT_ROLE alır.
 */
const SECRET = 'test-jwt-access-secret-at-least-32-chars';
const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const TARGET_ID = '0190f0e4-0000-7000-8000-0000000000ff';
const OUTSIDER = '0190f0e4-0000-7000-8000-0000000000ee';

const USER_BY_ROLE: Record<OrgRole, string> = {
  [OrgRole.Owner]: '0190f0e4-0000-7000-8000-0000000000a1',
  [OrgRole.Admin]: '0190f0e4-0000-7000-8000-0000000000a2',
  [OrgRole.Analyst]: '0190f0e4-0000-7000-8000-0000000000a3',
  [OrgRole.ClientViewer]: '0190f0e4-0000-7000-8000-0000000000a4',
};

type Permission = keyof typeof ROLE_MATRIX;

/** §4.2 tablosu, dokümandaki gibi elle yazılmış. ROLE_MATRIX buna eşit olmalı. */
const ARCHITECTURE_4_2: Record<Permission, OrgRole[]> = {
  orgManage: [OrgRole.Owner],
  memberManage: [OrgRole.Owner, OrgRole.Admin],
  clientProjectManage: [OrgRole.Owner, OrgRole.Admin],
  connectionManage: [OrgRole.Owner, OrgRole.Admin],
  contentManage: [OrgRole.Owner, OrgRole.Admin, OrgRole.Analyst],
  dataView: [
    OrgRole.Owner,
    OrgRole.Admin,
    OrgRole.Analyst,
    OrgRole.ClientViewer,
  ],
  reportView: [
    OrgRole.Owner,
    OrgRole.Admin,
    OrgRole.Analyst,
    OrgRole.ClientViewer,
  ],
};

interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  permission: Permission;
  body?: object;
}

/** Bu karttaki org kapsamlı endpoint'ler ve §4.2'deki karşılıkları. */
const ENDPOINTS: Endpoint[] = [
  { method: 'get', path: '/organizations/current', permission: 'dataView' },
  {
    method: 'patch',
    path: '/organizations/current',
    permission: 'orgManage',
    body: { name: 'Yeni ad' },
  },
  { method: 'delete', path: '/organizations/current', permission: 'orgManage' },
  { method: 'get', path: '/members', permission: 'memberManage' },
  {
    method: 'patch',
    path: `/members/${TARGET_ID}`,
    permission: 'memberManage',
    body: { role: 'analyst' },
  },
  { method: 'delete', path: `/members/${TARGET_ID}`, permission: 'orgManage' },
  { method: 'get', path: '/invitations', permission: 'memberManage' },
  {
    method: 'post',
    path: '/invitations',
    permission: 'memberManage',
    body: { email: 'yeni@example.com', role: 'analyst' },
  },
  {
    method: 'delete',
    path: `/invitations/${TARGET_ID}`,
    permission: 'memberManage',
  },
];

interface ErrorBody {
  error: { code: string };
}

async function createApp() {
  const organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const membershipsService = {
    resolve: jest.fn((orgId: string, userId: string) => {
      const role = (Object.keys(USER_BY_ROLE) as OrgRole[]).find(
        (key) => USER_BY_ROLE[key] === userId,
      );
      return Promise.resolve(
        orgId === ORG_ID && role
          ? {
              role,
              clientId: role === OrgRole.ClientViewer ? 'client-1' : null,
            }
          : undefined,
      );
    }),
    list: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    changeRole: jest.fn().mockResolvedValue({
      userId: TARGET_ID,
      role: OrgRole.Analyst,
      clientId: null,
    }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const organizationsService = {
    create: jest.fn().mockResolvedValue(organization),
    listForUser: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    getCurrent: jest.fn().mockResolvedValue(organization),
    update: jest.fn().mockResolvedValue(organization),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const invitationsService = {
    create: jest.fn().mockResolvedValue({
      invitation: {
        id: TARGET_ID,
        email: 'yeni@example.com',
        role: OrgRole.Analyst,
        clientId: null,
        expiresAt: new Date(),
        invitedBy: null,
        createdAt: new Date(),
      },
      emailSent: true,
    }),
    listPending: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
    revoke: jest.fn().mockResolvedValue(undefined),
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
    controllers: [
      OrganizationsController,
      MembersController,
      InvitationsController,
    ],
    providers: [
      { provide: MembershipsService, useValue: membershipsService },
      { provide: OrganizationsService, useValue: organizationsService },
      { provide: InvitationsService, useValue: invitationsService },
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      // AppModule'deki sırayla: JwtAuthGuard (AuthModule), sonra OrganizationsModule'ünkiler
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: TenantGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();

  const jwt = moduleRef.get(JwtService);
  return {
    app: app as INestApplication<App>,
    token: (userId: string) => jwt.sign({ sub: userId }),
    membershipsService,
    organizationsService,
  };
}

describe('Rol matrisi (ARCHITECTURE §4.2)', () => {
  let ctx: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function call(endpoint: Endpoint, userId: string, orgId = ORG_ID) {
    const req = request(ctx.app.getHttpServer())
      [endpoint.method](`/api/v1${endpoint.path}`)
      .set('Authorization', `Bearer ${ctx.token(userId)}`)
      .set('X-Org-Id', orgId);
    return endpoint.body ? req.send(endpoint.body) : req;
  }

  it('ROLE_MATRIX dokümandaki tabloyla aynı', () => {
    expect(ROLE_MATRIX).toEqual(ARCHITECTURE_4_2);
  });

  const cases = ENDPOINTS.flatMap((endpoint) =>
    ALL_ORG_ROLES.map((role) => ({
      endpoint,
      role,
      allowed: ARCHITECTURE_4_2[endpoint.permission].includes(role),
    })),
  );

  it.each(
    cases.map((c) => [
      `${c.endpoint.method.toUpperCase()} ${c.endpoint.path}`,
      c.role,
      c.allowed ? 'izinli' : '403',
      c,
    ]),
  )('%s — %s: %s', async (_route, _role, _expected, c) => {
    const response = await call(c.endpoint, USER_BY_ROLE[c.role]);

    if (c.allowed) {
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    } else {
      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('INSUFFICIENT_ROLE');
    }
  });

  it.each(
    ENDPOINTS.map((endpoint) => [endpoint.method, endpoint.path, endpoint]),
  )(
    '%s %s: üye olmayan 403 ORG_ACCESS_DENIED, token yoksa 401',
    async (_method, _path, endpoint) => {
      const outsider = await call(endpoint, OUTSIDER);
      expect(outsider.status).toBe(403);
      expect((outsider.body as ErrorBody).error.code).toBe('ORG_ACCESS_DENIED');

      const anonymous = await request(ctx.app.getHttpServer())
        [endpoint.method](`/api/v1${endpoint.path}`)
        .set('X-Org-Id', ORG_ID);
      expect(anonymous.status).toBe(401);
    },
  );

  it('rol kontrolü TenantGuard’ın doğruladığı role göre yapılır, başka org için değil', async () => {
    const owner = USER_BY_ROLE[OrgRole.Owner];
    const otherOrg = '0190f0e4-0000-7000-8000-00000000000b';
    const deletesBefore = ctx.organizationsService.delete.mock.calls.length;

    const response = await call(
      {
        method: 'delete',
        path: '/organizations/current',
        permission: 'orgManage',
      },
      owner,
      otherOrg,
    );

    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).error.code).toBe('ORG_ACCESS_DENIED');
    expect(ctx.organizationsService.delete).toHaveBeenCalledTimes(
      deletesBefore,
    );
  });

  it('/organizations listeleme ve oluşturma X-Org-Id istemez (@SkipTenant)', async () => {
    const token = ctx.token(OUTSIDER);
    const server = ctx.app.getHttpServer();

    const list = await request(server)
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`);
    const create = await request(server)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Yeni Ajans' });

    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    expect(ctx.organizationsService.create).toHaveBeenCalledWith(
      { name: 'Yeni Ajans' },
      OUTSIDER,
    );
  });

  it('org kapsamlı endpoint X-Org-Id olmadan 400 ORG_ID_REQUIRED', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/api/v1/members')
      .set('Authorization', `Bearer ${ctx.token(USER_BY_ROLE.owner)}`);

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('ORG_ID_REQUIRED');
  });
});
