import { ClsService } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import { AppClsStore } from '../src/common/cls-store';
import { runInTenant } from '../src/common/tenancy/run-in-tenant';
import {
  Ga4Client,
  Ga4RunReportResult,
} from '../src/connectors/ga4/ga4.client';
import { ConnectionsService } from '../src/modules/connections/connections.service';
import {
  Connection,
  ConnectionType,
} from '../src/modules/connections/entities/connection.entity';
import { Ga4SyncService } from '../src/modules/ga4/ga4-sync.service';
import {
  createE2eApp,
  describeWithDatabase,
  E2eContext,
} from './support/e2e-app';

/**
 * PLAN T1.6 kabulü: aynı günün sync'i iki kez çalışınca satır sayısı
 * değişmez (upsert idempotency). GA4 API'si mock'lanır; yazma gerçek test
 * DB'sindeki partition'lı tabloya yapılır. T1.5'teki `gsc-sync.e2e-spec.ts`
 * kalıbı.
 */
const DATE = '2026-09-25';

function fakeGa4Response(sessions: number): Ga4RunReportResult {
  return {
    dimensionHeaders: [
      'date',
      'landingPagePlusQueryString',
      'sessionDefaultChannelGroup',
    ],
    metricHeaders: ['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue'],
    rows: [
      {
        dimensionValues: ['20260925', '/a', 'Organic Search'],
        metricValues: [String(sessions), String(sessions - 1), '1', '3.5'],
      },
      {
        dimensionValues: ['20260925', '/b', 'Direct'],
        metricValues: [String(sessions), String(sessions - 1), '0', '0'],
      },
    ],
  };
}

describeWithDatabase('GA4 sync upsert idempotency (e2e, test DB)', () => {
  let ctx: E2eContext;
  let sessions = 5;

  beforeAll(async () => {
    ctx = await createE2eApp();
    await ctx.reset();
    const ga4Client = ctx.app.get(Ga4Client, { strict: false });
    jest
      .spyOn(ga4Client, 'runReport')
      .mockImplementation((params) =>
        Promise.resolve(
          (params.offset ?? 0) > 0
            ? { dimensionHeaders: [], metricHeaders: [], rows: [] }
            : fakeGa4Response(sessions),
        ),
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
       VALUES ($1, $2, $3, 'ga4', 'properties/123456789', 'active')`,
      [uuidv7(), orgId, projectId],
    );
    const cls = ctx.app.get<ClsService<AppClsStore>>(ClsService);
    const connections = ctx.app.get(ConnectionsService, { strict: false });
    const connection = await runInTenant(cls, orgId, () =>
      connections.findByProjectAndType(projectId, ConnectionType.Ga4),
    );
    return { orgId, connection: connection! };
  }

  async function counts(projectId: string) {
    const [result] = await ctx.dataSource.query<
      { rows: number; sessions: number }[]
    >(
      `SELECT
         (SELECT COUNT(*)::int FROM ga4_daily WHERE project_id = $1) AS rows,
         (SELECT SUM(sessions)::int FROM ga4_daily WHERE project_id = $1) AS sessions`,
      [projectId],
    );
    return result;
  }

  it('aynı gün iki kez çalışınca satır sayısı değişmez, metrikler güncellenir', async () => {
    const { orgId, connection } = await seedProject();
    const cls = ctx.app.get<ClsService<AppClsStore>>(ClsService);
    const sync = ctx.app.get(Ga4SyncService, { strict: false });

    sessions = 5;
    await runInTenant(cls, orgId, () => sync.syncRange(connection, DATE, DATE));
    const first = await counts(connection.projectId);

    sessions = 9;
    await runInTenant(cls, orgId, () => sync.syncRange(connection, DATE, DATE));
    const second = await counts(connection.projectId);

    expect(first).toEqual({ rows: 2, sessions: 10 });
    expect(second).toEqual({ rows: 2, sessions: 18 });
  });

  it("hash kolonu Postgres md5(text) ile aynı ve org_id CLS'teki org", async () => {
    const { orgId, connection } = await seedProject();
    const cls = ctx.app.get<ClsService<AppClsStore>>(ClsService);
    const sync = ctx.app.get(Ga4SyncService, { strict: false });

    await runInTenant(cls, orgId, () => sync.syncRange(connection, DATE, DATE));

    const mismatches = await ctx.dataSource.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM ga4_daily
        WHERE project_id = $1
          AND (landing_page_hash <> md5(landing_page) OR org_id <> $2)`,
      [connection.projectId, orgId],
    );
    expect(mismatches[0].count).toBe(0);
  });
});
