import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { TenantContextMissingError } from '../../common/tenancy/tenant.errors';
import { RankSource } from './entities/rank-daily.entity';
import { MAX_RANK_TASK_ATTEMPTS, RankStore } from './rank-store';

const ORG = '0190f0e4-0000-7000-8000-00000000000a';
const PROJECT = '0190f0e4-0000-7000-8000-00000000000e';
const KW1 = '0190f0e4-0000-7000-8000-0000000000c1';
const KW2 = '0190f0e4-0000-7000-8000-0000000000c2';

function setup(orgId: string | null = ORG, rows: unknown = []) {
  const query = jest.fn().mockResolvedValue(rows);
  const cls = {
    isActive: () => orgId !== null,
    get: () => orgId,
  } as unknown as ClsService<AppClsStore>;
  const store = new RankStore({ query } as unknown as DataSource, cls);
  return { store, query };
}

function normalizeSql(sql: unknown): string {
  return (sql as string).replace(/\s+/g, ' ');
}

describe('RankStore', () => {
  it("claimTasks aynı gün task'ı olanı atlayan tek bir INSERT ... ON CONFLICT yapar", async () => {
    const { store, query } = setup(ORG, [{ id: 't1', trackedKeywordId: KW1 }]);

    const claimed = await store.claimTasks(PROJECT, '2026-09-28', [KW1, KW2]);

    expect(claimed).toEqual([{ id: 't1', trackedKeywordId: KW1 }]);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(sql);
    expect(normalized).toContain(
      'ON CONFLICT ("tracked_keyword_id", "check_date") DO UPDATE',
    );
    // Yalnız gönderilememiş failed task yeniden ayrılır.
    expect(normalized).toContain(`"rank_tasks"."status" = 'failed'`);
    expect(normalized).toContain(`"rank_tasks"."provider_task_id" IS NULL`);
    expect(normalized).toContain(`"rank_tasks"."org_id" = $1`);
    expect(parameters[0]).toBe(ORG);
    expect(parameters[1]).toBe(PROJECT);
    expect(parameters[2]).toBe('2026-09-28');
    expect(parameters[3]).toHaveLength(2);
    expect(parameters[4]).toEqual([KW1, KW2]);
    expect(parameters[5]).toBe(MAX_RANK_TASK_ATTEMPTS);
  });

  it('boş listede sorgu atmaz', async () => {
    const { store, query } = setup();
    await expect(store.claimTasks(PROJECT, '2026-09-28', [])).resolves.toEqual(
      [],
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("tenant metodları CLS'te org yoksa çalışmaz", async () => {
    const { store, query } = setup(null);
    await expect(
      store.claimTasks(PROJECT, '2026-09-28', [KW1]),
    ).rejects.toBeInstanceOf(TenantContextMissingError);
    await expect(store.findTask('t1')).rejects.toBeInstanceOf(
      TenantContextMissingError,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("upsertRankDaily (date, tracked_keyword_id) üzerinden upsert eder ve org'u CLS'ten alır", async () => {
    const { store, query } = setup();

    await store.upsertRankDaily({
      date: '2026-09-28',
      projectId: PROJECT,
      trackedKeywordId: KW1,
      position: 3,
      rankAbsolute: 6,
      url: 'https://blog.example.com/',
      serpFeatures: ['featured_snippet'],
      competitorsTop: [{ domain: 'a.com', position: 1 }],
      checkedAt: new Date('2026-09-28T04:05:00Z'),
      source: RankSource.DfsLive,
    });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain(
      'ON CONFLICT ("date", "tracked_keyword_id") DO UPDATE',
    );
    expect(parameters).toEqual([
      '2026-09-28',
      ORG,
      PROJECT,
      KW1,
      3,
      6,
      'https://blog.example.com/',
      ['featured_snippet'],
      '[{"domain":"a.com","position":1}]',
      new Date('2026-09-28T04:05:00Z'),
      'dfs_live',
    ]);
  });

  it("systemMarkReady yalnız açık task'ları ready yapar ve satırları CTE'den okur", async () => {
    const rows = [
      { id: 't1', orgId: ORG, projectId: PROJECT, providerTaskId: 'dfs-1' },
    ];
    const { store, query } = setup(null, rows);

    await expect(store.systemMarkReady(['dfs-1', 'x'])).resolves.toEqual(rows);

    const [sql] = query.mock.calls[0] as [string];
    const normalized = normalizeSql(sql);
    expect(normalized).toMatch(/^ WITH ready AS \( UPDATE "rank_tasks"/);
    expect(normalized).toContain(`"status" IN ('posted', 'ready')`);
  });

  it("systemFailStale posted_at'i eşikten eski açık task'ları failed yapar", async () => {
    const { store, query } = setup(null, []);
    const threshold = new Date('2026-09-27T04:00:00Z');

    await store.systemFailStale(threshold, 'zaman aşımı');

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(sql)).toContain(
      `WHERE "status" IN ('posted', 'ready') AND "posted_at" < $1`,
    );
    expect(parameters).toEqual([threshold, 'zaman aşımı']);
  });
});
