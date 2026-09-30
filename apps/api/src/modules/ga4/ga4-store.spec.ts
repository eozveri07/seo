import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { md5 } from '../../common/hash/md5';
import { TenantContextMissingError } from '../../common/tenancy/tenant.errors';
import { GA4_UPSERT_BATCH_SIZE, Ga4Store } from './ga4-store';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function buildStore(orgId: string | null = 'org-1') {
  const query = jest.fn().mockResolvedValue([]);
  const cls = {
    isActive: () => true,
    get: () => orgId ?? undefined,
  } as unknown as ClsService<AppClsStore>;
  const store = new Ga4Store({ query } as unknown as DataSource, cls);
  return { store, query };
}

function row(landingPage: string, sessions = 1) {
  return {
    date: '2026-09-25',
    landingPage,
    channelGroup: 'Organic Search',
    sessions,
    engagedSessions: 8,
    keyEvents: 2,
    totalRevenue: 12.5,
  };
}

describe('Ga4Store', () => {
  it("satırları 1000'lik batch'lerle ON CONFLICT DO UPDATE olarak yazar", async () => {
    const { store, query } = buildStore();
    const rows = Array.from({ length: 2500 }, (_, i) => row(`/landing-${i}`));

    await store.upsertRows(PROJECT_ID, rows);

    expect(query).toHaveBeenCalledTimes(3);
    const sizes = query.mock.calls.map(
      ([, parameters]: [string, unknown[]]) => parameters.length / 10,
    );
    expect(sizes).toEqual([GA4_UPSERT_BATCH_SIZE, GA4_UPSERT_BATCH_SIZE, 500]);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "ga4_daily"');
    expect(sql).toContain(
      'ON CONFLICT ("date", "project_id", "landing_page_hash", "channel_group") DO UPDATE SET',
    );
    expect(sql).toContain('"sessions" = EXCLUDED."sessions"');
  });

  it("org_id'yi CLS'ten, hash'i md5 olarak yazar", async () => {
    const { store, query } = buildStore('org-cls');

    await store.upsertRows(PROJECT_ID, [row('/a', 3)]);

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "ga4_daily"');
    expect(parameters).toEqual([
      '2026-09-25',
      'org-cls',
      PROJECT_ID,
      '/a',
      md5('/a'),
      'Organic Search',
      3,
      8,
      2,
      12.5,
    ]);
  });

  it("aynı batch'te tekrar eden PK'yı tekilleştirir (son gelen kazanır)", async () => {
    const { store, query } = buildStore();

    await store.upsertRows(PROJECT_ID, [row('/a', 1), row('/a', 7)]);

    const [, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toHaveLength(10);
    expect(parameters[6]).toBe(7);
  });

  it('boş listede sorgu atmaz', async () => {
    const { store, query } = buildStore();

    await store.upsertRows(PROJECT_ID, []);

    expect(query).not.toHaveBeenCalled();
  });

  it("CLS'te org yoksa yazmaz", async () => {
    const { store, query } = buildStore(null);

    await expect(store.upsertRows(PROJECT_ID, [])).rejects.toBeInstanceOf(
      TenantContextMissingError,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
