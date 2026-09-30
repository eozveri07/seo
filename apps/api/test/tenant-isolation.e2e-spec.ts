import {
  createE2eApp,
  describeWithDatabase,
  E2eContext,
} from './support/e2e-app';

/**
 * Tenant izolasyonu (CLAUDE.md "Test", PLAN.md T1.2): org A'nın kullanıcısı
 * org B'nin hiçbir kaynağını göremez ve değiştiremez.
 *
 * İki org, iki kullanıcı: `alice` yalnız A'nın, `bob` yalnız B'nin owner'ı.
 * Her kaynak `RESOURCES` listesinde tek satırdır; yeni bir tenant kaynağı
 * eklendiğinde buraya bir satır (gerekirse `seedOrgB`'ye bir fixture) eklenir.
 * Her satır iki yoldan denenir:
 *
 * 1. `X-Org-Id: B` ile: alice B'nin üyesi olmadığı için 403 ORG_ACCESS_DENIED.
 * 2. Path'te B'nin kaynak id'si varsa `X-Org-Id: A` ile: kaynak A'da olmadığı
 *    için 404 (başka org'un id'siyle erişim, TenantRepository kapsamı).
 *
 * Sonunda B'nin verisinin değişmediği bob'un gözünden doğrulanır.
 */

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** org B'de önceden oluşturulan kaynakların id'leri. */
interface OrgBFixtures {
  orgId: string;
  ownerUserId: string;
  invitationId: string;
  clientId: string;
  projectId: string;
}

interface TenantResource {
  name: string;
  method: Method;
  path: (b: OrgBFixtures) => string;
  body?: Record<string, unknown>;
  /** Path B'nin bir kaynağını gösteriyorsa true: A'nın header'ıyla 404 beklenir. */
  referencesOrgB?: boolean;
}

const RESOURCES: TenantResource[] = [
  { name: 'org detayı', method: 'get', path: () => '/organizations/current' },
  {
    name: 'org güncelleme',
    method: 'patch',
    path: () => '/organizations/current',
    body: { name: 'Ele geçirildi' },
  },
  { name: 'org silme', method: 'delete', path: () => '/organizations/current' },
  { name: 'üye listesi', method: 'get', path: () => '/members' },
  {
    name: 'üye rol değişimi',
    method: 'patch',
    path: (b) => `/members/${b.ownerUserId}`,
    body: { role: 'analyst' },
    referencesOrgB: true,
  },
  {
    name: 'üye çıkarma',
    method: 'delete',
    path: (b) => `/members/${b.ownerUserId}`,
    referencesOrgB: true,
  },
  { name: 'davet listesi', method: 'get', path: () => '/invitations' },
  {
    name: 'davet oluşturma',
    method: 'post',
    path: () => '/invitations',
    body: { email: 'saldirgan@example.com', role: 'owner' },
  },
  {
    name: 'davet geri çekme',
    method: 'delete',
    path: (b) => `/invitations/${b.invitationId}`,
    referencesOrgB: true,
  },
  { name: 'client listesi', method: 'get', path: () => '/clients' },
  {
    name: 'client oluşturma',
    method: 'post',
    path: () => '/clients',
    body: { name: 'Ele geçirilen client' },
  },
  {
    name: 'client detayı',
    method: 'get',
    path: (b) => `/clients/${b.clientId}`,
    referencesOrgB: true,
  },
  {
    name: 'client güncelleme',
    method: 'patch',
    path: (b) => `/clients/${b.clientId}`,
    body: { name: 'Ele geçirildi' },
    referencesOrgB: true,
  },
  {
    name: 'client silme',
    method: 'delete',
    path: (b) => `/clients/${b.clientId}`,
    referencesOrgB: true,
  },
  { name: 'proje listesi', method: 'get', path: () => '/projects' },
  {
    name: 'proje oluşturma',
    method: 'post',
    path: () => '/projects',
    body: { name: 'Ele geçirilen proje', domain: 'saldirgan.example.com' },
  },
  {
    name: 'proje detayı',
    method: 'get',
    path: (b) => `/projects/${b.projectId}`,
    referencesOrgB: true,
  },
  {
    name: 'proje güncelleme',
    method: 'patch',
    path: (b) => `/projects/${b.projectId}`,
    body: { name: 'Ele geçirildi' },
    referencesOrgB: true,
  },
  {
    name: 'proje silme',
    method: 'delete',
    path: (b) => `/projects/${b.projectId}`,
    referencesOrgB: true,
  },
];

interface ErrorBody {
  error: { code: string };
}

describeWithDatabase('Tenant izolasyonu (e2e, test DB)', () => {
  let ctx: E2eContext;
  let aliceToken: string;
  let bobToken: string;
  let orgA: string;
  let orgB: OrgBFixtures;

  async function createOrg(token: string, name: string): Promise<string> {
    const response = await ctx
      .http()
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function seedOrgB(): Promise<OrgBFixtures> {
    const orgId = await createOrg(bobToken, 'Org B');
    const invitation = await ctx
      .http()
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({ email: 'b-davetli@example.com', role: 'analyst' });
    expect(invitation.status).toBe(201);
    const bobId = await ctx.dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE email = 'bob@example.com'`,
    );
    const client = await ctx
      .http()
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({ name: "B'nin client'ı" });
    expect(client.status).toBe(201);
    const clientId = (client.body as { id: string }).id;
    const project = await ctx
      .http()
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({
        clientId,
        name: "B'nin projesi",
        domain: 'b-project.example.com',
      });
    expect(project.status).toBe(201);
    return {
      orgId,
      ownerUserId: bobId[0].id,
      invitationId: (invitation.body as { id: string }).id,
      clientId,
      projectId: (project.body as { id: string }).id,
    };
  }

  function call(resource: TenantResource, orgId: string) {
    const req = ctx
      .http()
      [resource.method](`/api/v1${resource.path(orgB)}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('X-Org-Id', orgId);
    return resource.body ? req.send(resource.body) : req;
  }

  beforeAll(async () => {
    ctx = await createE2eApp();
    await ctx.reset();
    await ctx.createUser('alice@example.com');
    await ctx.createUser('bob@example.com');
    aliceToken = await ctx.login('alice@example.com');
    bobToken = await ctx.login('bob@example.com');
    orgA = await createOrg(aliceToken, 'Org A');
    orgB = await seedOrgB();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe.each(RESOURCES.map((resource) => [resource.name, resource]))(
    '%s',
    (_name, resource) => {
      it('X-Org-Id: B ile 403 ORG_ACCESS_DENIED', async () => {
        const response = await call(resource, orgB.orgId);

        expect(response.status).toBe(403);
        expect((response.body as ErrorBody).error.code).toBe(
          'ORG_ACCESS_DENIED',
        );
      });

      if (resource.referencesOrgB) {
        it("X-Org-Id: A ile B'nin kaynağına 404", async () => {
          const response = await call(resource, orgA);

          expect(response.status).toBe(404);
        });
      }
    },
  );

  it("body'de org_id gönderilirse reddedilir, header'daki org kullanılır", async () => {
    const response = await ctx
      .http()
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('X-Org-Id', orgA)
      .send({ email: 'x@example.com', role: 'analyst', orgId: orgB.orgId });

    expect(response.status).toBe(400);
  });

  it('X-Org-Id olmadan org kapsamlı endpoint 400 ORG_ID_REQUIRED', async () => {
    const response = await ctx
      .http()
      .get('/api/v1/members')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(response.status).toBe(400);
    expect((response.body as ErrorBody).error.code).toBe('ORG_ID_REQUIRED');
  });

  it("alice'in org listesinde B yok", async () => {
    const response = await ctx
      .http()
      .get('/api/v1/organizations')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(response.status).toBe(200);
    const ids = (response.body as { items: { id: string }[] }).items.map(
      (item) => item.id,
    );
    expect(ids).toEqual([orgA]);
  });

  it("B'nin verisi değişmedi (bob'un gözünden)", async () => {
    const asBob = (path: string) =>
      ctx
        .http()
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .set('X-Org-Id', orgB.orgId);

    const org = await asBob('/organizations/current');
    expect(org.status).toBe(200);
    expect((org.body as { name: string }).name).toBe('Org B');

    const members = await asBob('/members');
    expect(members.body).toMatchObject({
      total: 1,
      items: [{ userId: orgB.ownerUserId, role: 'owner' }],
    });

    const invitations = await asBob('/invitations');
    expect(invitations.body).toMatchObject({
      total: 1,
      items: [{ id: orgB.invitationId, email: 'b-davetli@example.com' }],
    });

    const clients = await asBob('/clients');
    expect(clients.body).toMatchObject({
      total: 1,
      items: [{ id: orgB.clientId, name: "B'nin client'ı" }],
    });

    const projects = await asBob('/projects');
    expect(projects.body).toMatchObject({
      total: 1,
      items: [{ id: orgB.projectId, domain: 'b-project.example.com' }],
    });
  });
});
