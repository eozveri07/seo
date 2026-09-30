import { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { AppClsStore } from '../src/common/cls-store';
import { runInTenant } from '../src/common/tenancy/run-in-tenant';
import {
  GscClient,
  GscSearchAnalyticsQueryParams,
  GscSearchAnalyticsRow,
} from '../src/connectors/gsc/gsc.client';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import {
  Connection,
  ConnectionType,
} from '../src/modules/connections/entities/connection.entity';
import { GscSyncService } from '../src/modules/gsc/gsc-sync.service';
import {
  createE2eApp,
  describeWithDatabase,
  E2eContext,
} from './support/e2e-app';

/**
 * PLAN T1.5 kabulü: aynı günün sync'i iki kez çalışınca satır sayısı
 * değişmez (upsert idempotency). GSC API'si mock'lanır; yazma gerçek test
 * DB'sindeki partition'lı tablolara yapılır.
 */
const DATE = '2026-09-25';

function row(keys: string[], clicks: number): GscSearchAnalyticsRow {
  return { keys, clicks, impressions: clicks * 10, ctr: 0.1, position: 2.5 };
}

/** Boyut listesine göre tek sayfalık sabit cevap; sonraki sayfa boş. */
function fakeGscResponse(
  params: GscSearchAnalyticsQueryParams,
  clicks: number,
): GscSearchAnalyticsRow[] {
  if ((params.startRow ?? 0) > 0) {
    return [];
  }
  switch (params.dimensions.length) {
    case 1:
      return [row([DATE], clicks)];
    case 4:
      return [
        row([DATE, 'https://example.com/a', 'DESKTOP', 'tur'], clicks),
        row([DATE, 'https://example.com/a', 'MOBILE', 'tur'], clicks),
        row([DATE, 'https://example.com/b', 'MOBILE', 'deu'], clicks),
      ];
    default:
      return [
        row(
          [DATE, 'seo araçları', 'https://example.com/a', 'MOBILE', 'tur'],
          clicks,
        ),
        row([DATE, 'seo', 'https://example.com/a', 'MOBILE', 'tur'], clicks),
        row([DATE, 'seo', 'https://example.com/b', 'DESKTOP', 'deu'], clicks),
        row(
          [DATE, "o'reilly %_", 'https://example.com/b', 'TABLET', 'usa'],
          clicks,
        ),
      ];
  }
}

describeWithDatabase('GSC sync upsert idempotency (e2e, test DB)', () => {
  let ctx: E2eContext;
  let clicks = 5;

  beforeAll(async () => {
    ctx = await createE2eApp();
    await ctx.reset();
    const gscClient = ctx.app.get(GscClient, { strict: false });
    jest
      .spyOn(gscClient, 'searchAnalyticsQuery')
      .mockImplementation((params) =>
        Promise.resolve(fakeGscResponse(params, clicks)),
      );
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function seedProject(): Promise<{
    orgId: string;
    connection: Connection;
  }> {
    const orgId = uuidv7();
    const clientId = uuidv7();
    const projectId = uuidv7();
    await ctx.dataSource.query(
      `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Org', $2)`,
      [orgId, `org-${orgId}`],
    );
    await ctx.dataSource.query(
      `INSERT INTO clients (id, org_id, name) VALUES ($1, $2, 'Client')`,
      [clientId, orgId],
    );
    await ctx.dataSource.query(
      `INSERT INTO projects (id, org_id, client_id, name, domain) VALUES ($1, $2, $3, 'Proje', 'example.com')`,
      [projectId, orgId, clientId],
    );
    await ctx.dataSource.query(
      `INSERT INTO connections (id, org_id, project_id, type, external_id, status)
       VALUES ($1, $2, $3, 'gsc', 'sc-domain:example.com', 'active')`,
      [uuidv7(), orgId, projectId],
    );
    const cls = ctx.app.get<ClsService<AppClsStore>>(ClsService);
    const connections = ctx.app.get(ConnectionsService, { strict: false });
    const connection = await runInTenant(cls, orgId, () =>
      connections.findByProjectAndType(projectId, ConnectionType.Gsc),
    );
    return { orgId, connection: connection! };
  }

  async function counts(projectId: string) {
    const [result] = await ctx.dataSource.query<
      { site: number; page: number; query: number; clicks: number }[]
    >(
      `SELECT
         (SELECT COUNT(*)::int FROM gsc_site_daily WHERE project_id = $1) AS site,
         (SELECT COUNT(*)::int FROM gsc_page_daily WHERE project_id = $1) AS page,
         (SELECT COUNT(*)::int FROM gsc_daily WHERE project_id = $1) AS query,
         (SELECT SUM(clicks)::int FROM gsc_daily WHERE project_id = $1) AS clicks`,
      [projectId],
    );
    return result;
  }

  it('aynı gün iki kez çalışınca satır sayısı değişmez, metrikler güncellenir', async () => {
    const { orgId, connection } = await seedProject();
    const cls = ctx.app.get<ClsService<AppClsStore>>(ClsService);
    const sync = ctx.app.get(GscSyncService, { strict: false });

    clicks = 5;
    await runInTenant(cls, orgId, () => sync.syncDay(connection, DATE));
    const first = await counts(connection.projectId);

    clicks = 9;
    await runInTenant(cls, orgId, () => sync.syncDay(connection, DATE));
    const second = await counts(connection.projectId);

    expect(first).toEqual({ site: 1, page: 3, query: 4, clicks: 20 });
    expect(second).toEqual({ site: 1, page: 3, query: 4, clicks: 36 });
  });

  it("hash kolonları Postgres md5(text) ile aynı ve org_id CLS'teki org", async () => {
    const { orgId, connection } = await seedProject();
    const cls = ctx.app.get<ClsService<AppClsStore>>(ClsService);
    const sync = ctx.app.get(GscSyncService, { strict: false });

    await runInTenant(cls, orgId, () => sync.syncDay(connection, DATE));

    const mismatches = await ctx.dataSource.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM gsc_daily
        WHERE project_id = $1
          AND (query_hash <> md5(query) OR page_hash <> md5(page) OR org_id <> $2)`,
      [connection.projectId, orgId],
    );
    expect(mismatches[0].count).toBe(0);
  });
});
