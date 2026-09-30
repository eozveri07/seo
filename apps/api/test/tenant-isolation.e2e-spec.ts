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

/** md5('abc'); GSC detay endpoint'leri için geçerli biçimde bir hash. */
const GSC_HASH = '900150983cd24fb0d6963f7d28e17f72';

/** org B'de önceden oluşturulan kaynakların id'leri. */
interface OrgBFixtures {
  orgId: string;
  ownerUserId: string;
  invitationId: string;
  clientId: string;
  projectId: string;
  connectionId: string;
  keywordGroupId: string;
  keywordId: string;
  notificationChannelId: string;
  alertRuleId: string;
  reportId: string;
  reportScheduleId: string;
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
  {
    name: 'bağlantı listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/connections`,
    referencesOrgB: true,
  },
  {
    name: 'bağlantı oluşturma',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/connections`,
    body: { type: 'gsc', externalId: 'sc-domain:ele-gecirilen.example.com' },
    referencesOrgB: true,
  },
  {
    name: 'GSC property listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/connections/gsc/sites`,
    referencesOrgB: true,
  },
  {
    name: 'bağlantı detayı',
    method: 'get',
    path: (b) => `/connections/${b.connectionId}`,
    referencesOrgB: true,
  },
  {
    name: 'bağlantı doğrulama',
    method: 'post',
    path: (b) => `/connections/${b.connectionId}/verify`,
    referencesOrgB: true,
  },
  {
    name: 'GSC manuel sync',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/sync/gsc`,
    referencesOrgB: true,
  },
  {
    name: 'GSC overview',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/gsc/overview?compare=previous`,
    referencesOrgB: true,
  },
  {
    name: 'GSC sorgu tablosu',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/gsc/queries`,
    referencesOrgB: true,
  },
  {
    name: 'GSC sayfa tablosu',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/gsc/pages`,
    referencesOrgB: true,
  },
  {
    name: 'GSC sorgunun sayfaları',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/gsc/queries/${GSC_HASH}/pages`,
    referencesOrgB: true,
  },
  {
    name: 'GSC sayfanın sorguları',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/gsc/pages/${GSC_HASH}/queries`,
    referencesOrgB: true,
  },
  {
    name: 'GA4 manuel sync',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/sync/ga4`,
    referencesOrgB: true,
  },
  {
    name: 'GA4 overview',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/ga4/overview`,
    referencesOrgB: true,
  },
  {
    name: 'GA4 landing page tablosu',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/ga4/landing-pages`,
    referencesOrgB: true,
  },
  {
    name: 'bağlantı silme',
    method: 'delete',
    path: (b) => `/connections/${b.connectionId}`,
    referencesOrgB: true,
  },
  {
    name: 'keyword grubu listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/keyword-groups`,
    referencesOrgB: true,
  },
  {
    name: 'keyword grubu oluşturma',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/keyword-groups`,
    body: { name: 'Ele geçirilen grup' },
    referencesOrgB: true,
  },
  {
    name: 'keyword grubu detayı',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/keyword-groups/${b.keywordGroupId}`,
    referencesOrgB: true,
  },
  {
    name: 'keyword grubu güncelleme',
    method: 'patch',
    path: (b) => `/projects/${b.projectId}/keyword-groups/${b.keywordGroupId}`,
    body: { name: 'Ele geçirildi' },
    referencesOrgB: true,
  },
  {
    name: 'keyword grubu silme',
    method: 'delete',
    path: (b) => `/projects/${b.projectId}/keyword-groups/${b.keywordGroupId}`,
    referencesOrgB: true,
  },
  {
    name: 'keyword listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/keywords`,
    referencesOrgB: true,
  },
  {
    name: 'keyword oluşturma',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/keywords`,
    body: { keyword: 'ele geçirilen keyword' },
    referencesOrgB: true,
  },
  {
    name: 'keyword bulk ekleme',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/keywords/bulk`,
    body: { text: 'ele geçirilen keyword' },
    referencesOrgB: true,
  },
  {
    name: 'keyword önerileri',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/keywords/suggestions`,
    referencesOrgB: true,
  },
  {
    name: 'keyword detayı',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/keywords/${b.keywordId}`,
    referencesOrgB: true,
  },
  {
    name: 'keyword güncelleme',
    method: 'patch',
    path: (b) => `/projects/${b.projectId}/keywords/${b.keywordId}`,
    body: { isActive: false },
    referencesOrgB: true,
  },
  {
    name: 'keyword silme',
    method: 'delete',
    path: (b) => `/projects/${b.projectId}/keywords/${b.keywordId}`,
    referencesOrgB: true,
  },
  {
    name: 'keyword anlık rank kontrolü',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/keywords/${b.keywordId}/check-now`,
    referencesOrgB: true,
  },
  {
    name: 'rank geçmişi',
    method: 'get',
    path: (b) =>
      `/projects/${b.projectId}/rankings/history?keywordIds=${b.keywordId}&from=2026-09-01&to=2026-09-01`,
    referencesOrgB: true,
  },
  {
    name: "günün SERP'i",
    method: 'get',
    path: (b) =>
      `/projects/${b.projectId}/rankings/serp/${b.keywordId}?date=2026-09-01`,
    referencesOrgB: true,
  },
  {
    name: 'bildirim kanalı listesi',
    method: 'get',
    path: () => '/notification-channels',
  },
  {
    name: 'bildirim kanalı oluşturma',
    method: 'post',
    path: () => '/notification-channels',
    body: {
      type: 'slack',
      name: 'Ele geçirilen kanal',
      config: { webhookUrl: 'https://hooks.slack.com/services/ele-gecirildi' },
    },
  },
  {
    name: 'bildirim kanalı detayı',
    method: 'get',
    path: (b) => `/notification-channels/${b.notificationChannelId}`,
    referencesOrgB: true,
  },
  {
    name: 'bildirim kanalı güncelleme',
    method: 'patch',
    path: (b) => `/notification-channels/${b.notificationChannelId}`,
    body: { name: 'Ele geçirildi' },
    referencesOrgB: true,
  },
  {
    name: 'bildirim kanalı test',
    method: 'post',
    path: (b) => `/notification-channels/${b.notificationChannelId}/test`,
    referencesOrgB: true,
  },
  {
    name: 'bildirim kanalı silme',
    method: 'delete',
    path: (b) => `/notification-channels/${b.notificationChannelId}`,
    referencesOrgB: true,
  },
  {
    name: 'alert kuralı listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/alert-rules`,
    referencesOrgB: true,
  },
  {
    name: 'alert kuralı oluşturma',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/alert-rules`,
    body: {
      name: 'Ele geçirilen kural',
      type: 'sync_failure',
      config: {},
      channels: [],
    },
    referencesOrgB: true,
  },
  {
    name: 'alert kuralı detayı',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/alert-rules/${b.alertRuleId}`,
    referencesOrgB: true,
  },
  {
    name: 'alert kuralı güncelleme',
    method: 'patch',
    path: (b) => `/projects/${b.projectId}/alert-rules/${b.alertRuleId}`,
    body: { name: 'Ele geçirildi' },
    referencesOrgB: true,
  },
  {
    name: 'alert kuralı silme',
    method: 'delete',
    path: (b) => `/projects/${b.projectId}/alert-rules/${b.alertRuleId}`,
    referencesOrgB: true,
  },
  {
    name: 'alert geçmişi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/alert-events`,
    referencesOrgB: true,
  },
  {
    name: 'rapor listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/reports`,
    referencesOrgB: true,
  },
  {
    name: 'rapor oluşturma',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/reports`,
    body: {
      type: 'custom',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-07',
    },
    referencesOrgB: true,
  },
  {
    name: 'rapor detayı',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/reports/${b.reportId}`,
    referencesOrgB: true,
  },
  {
    name: 'rapor indirme',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/reports/${b.reportId}/download`,
    referencesOrgB: true,
  },
  {
    name: 'rapor schedule listesi',
    method: 'get',
    path: (b) => `/projects/${b.projectId}/report-schedules`,
    referencesOrgB: true,
  },
  {
    name: 'rapor schedule oluşturma',
    method: 'post',
    path: (b) => `/projects/${b.projectId}/report-schedules`,
    body: {
      type: 'weekly',
      cron: '0 9 * * 1',
      timezone: 'Europe/Istanbul',
      recipients: ['ele-gecirildi@example.com'],
    },
    referencesOrgB: true,
  },
  {
    name: 'rapor schedule detayı',
    method: 'get',
    path: (b) =>
      `/projects/${b.projectId}/report-schedules/${b.reportScheduleId}`,
    referencesOrgB: true,
  },
  {
    name: 'rapor schedule güncelleme',
    method: 'patch',
    path: (b) =>
      `/projects/${b.projectId}/report-schedules/${b.reportScheduleId}`,
    body: { isActive: false },
    referencesOrgB: true,
  },
  {
    name: 'rapor schedule silme',
    method: 'delete',
    path: (b) =>
      `/projects/${b.projectId}/report-schedules/${b.reportScheduleId}`,
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
    const projectId = (project.body as { id: string }).id;
    const connection = await ctx
      .http()
      .post(`/api/v1/projects/${projectId}/connections`)
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({ type: 'gsc', externalId: 'sc-domain:b-project.example.com' });
    expect(connection.status).toBe(201);
    const keywordGroup = await ctx
      .http()
      .post(`/api/v1/projects/${projectId}/keyword-groups`)
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({ name: "B'nin grubu" });
    expect(keywordGroup.status).toBe(201);
    const keyword = await ctx
      .http()
      .post(`/api/v1/projects/${projectId}/keywords`)
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({ keyword: "b'nin keyword'ü" });
    expect(keyword.status).toBe(201);
    await ctx.dataSource.query(
      `INSERT INTO gsc_site_daily (date, org_id, project_id, clicks, impressions, ctr, position)
       VALUES ('2026-09-01', $1, $2, 7, 70, 0.1, 3)`,
      [orgId, projectId],
    );
    await ctx.dataSource.query(
      `INSERT INTO ga4_daily (date, org_id, project_id, landing_page, landing_page_hash, channel_group, sessions, engaged_sessions, key_events, total_revenue)
       VALUES ('2026-09-01', $1, $2, '/b', md5('/b'), 'Organic Search', 11, 9, 1, 4.5)`,
      [orgId, projectId],
    );
    const keywordId = (keyword.body as { id: string }).id;
    await ctx.dataSource.query(
      `INSERT INTO rank_daily (date, org_id, project_id, tracked_keyword_id, position, rank_absolute, url, serp_features, competitors_top, checked_at, source)
       VALUES ('2026-09-01', $1, $2, $3, 4, 5, 'https://b-project.example.com/', '{featured_snippet}', '[{"domain":"b-project.example.com","position":4}]', now(), 'dfs_standard')`,
      [orgId, projectId, keywordId],
    );
    const notificationChannel = await ctx
      .http()
      .post('/api/v1/notification-channels')
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({
        type: 'slack',
        name: "B'nin kanalı",
        config: { webhookUrl: 'https://hooks.slack.com/services/b-webhook' },
      });
    expect(notificationChannel.status).toBe(201);
    const notificationChannelId = (notificationChannel.body as { id: string })
      .id;
    const alertRule = await ctx
      .http()
      .post(`/api/v1/projects/${projectId}/alert-rules`)
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({
        name: "B'nin kuralı",
        type: 'sync_failure',
        config: {},
        channels: [notificationChannelId],
      });
    expect(alertRule.status).toBe(201);
    const report = await ctx
      .http()
      .post(`/api/v1/projects/${projectId}/reports`)
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({
        type: 'custom',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-07',
      });
    expect(report.status).toBe(201);
    const reportRun = await ctx.dataSource.query<{ id: string }[]>(
      `SELECT id FROM reports WHERE org_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orgId],
    );
    const reportSchedule = await ctx
      .http()
      .post(`/api/v1/projects/${projectId}/report-schedules`)
      .set('Authorization', `Bearer ${bobToken}`)
      .set('X-Org-Id', orgId)
      .send({
        type: 'weekly',
        cron: '0 9 * * 1',
        timezone: 'Europe/Istanbul',
        recipients: ['b@example.com'],
      });
    expect(reportSchedule.status).toBe(201);
    return {
      orgId,
      ownerUserId: bobId[0].id,
      invitationId: (invitation.body as { id: string }).id,
      clientId,
      projectId,
      connectionId: (connection.body as { id: string }).id,
      keywordGroupId: (keywordGroup.body as { id: string }).id,
      keywordId,
      notificationChannelId,
      alertRuleId: (alertRule.body as { id: string }).id,
      reportId: reportRun[0].id,
      reportScheduleId: (reportSchedule.body as { id: string }).id,
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

    const connections = await asBob(`/projects/${orgB.projectId}/connections`);
    expect(connections.body).toMatchObject({
      items: [
        {
          id: orgB.connectionId,
          externalId: 'sc-domain:b-project.example.com',
        },
      ],
    });

    const overview = await asBob(
      `/projects/${orgB.projectId}/gsc/overview?from=2026-09-01&to=2026-09-01`,
    );
    expect(overview.body).toMatchObject({ totals: { clicks: 7 } });

    const ga4Overview = await asBob(
      `/projects/${orgB.projectId}/ga4/overview?from=2026-09-01&to=2026-09-01`,
    );
    expect(ga4Overview.body).toMatchObject({ totals: { sessions: 11 } });

    const keywordGroups = await asBob(
      `/projects/${orgB.projectId}/keyword-groups`,
    );
    expect(keywordGroups.body).toMatchObject({
      items: [{ id: orgB.keywordGroupId, name: "B'nin grubu" }],
    });

    const keywords = await asBob(`/projects/${orgB.projectId}/keywords`);
    expect(keywords.body).toMatchObject({
      items: [{ id: orgB.keywordId, keyword: "b'nin keyword'ü" }],
    });

    const serp = await asBob(
      `/projects/${orgB.projectId}/rankings/serp/${orgB.keywordId}?date=2026-09-01`,
    );
    expect(serp.body).toMatchObject({ position: 4, source: 'dfs_standard' });

    const history = await asBob(
      `/projects/${orgB.projectId}/rankings/history?keywordIds=${orgB.keywordId}&from=2026-09-01&to=2026-09-01`,
    );
    expect(history.body).toMatchObject({
      keywords: [
        { trackedKeywordId: orgB.keywordId, points: [{ position: 4 }] },
      ],
    });

    const channels = await asBob('/notification-channels');
    expect(channels.body).toMatchObject({
      items: [{ id: orgB.notificationChannelId, name: "B'nin kanalı" }],
    });

    const alertRules = await asBob(`/projects/${orgB.projectId}/alert-rules`);
    expect(alertRules.body).toMatchObject({
      items: [{ id: orgB.alertRuleId, name: "B'nin kuralı" }],
    });

    const reports = await asBob(`/projects/${orgB.projectId}/reports`);
    expect(reports.body).toMatchObject({
      items: [{ id: orgB.reportId, periodStart: '2026-09-01' }],
    });

    const reportSchedules = await asBob(
      `/projects/${orgB.projectId}/report-schedules`,
    );
    expect(reportSchedules.body).toMatchObject({
      items: [{ id: orgB.reportScheduleId, cron: '0 9 * * 1' }],
    });

    const runs = await ctx.dataSource.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM job_runs WHERE org_id = $1`,
      [orgB.orgId],
    );
    expect(runs[0].count).toBe(0);
  });
});
