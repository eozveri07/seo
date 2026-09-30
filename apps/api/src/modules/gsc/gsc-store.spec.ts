import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { TenantContextMissingError } from '../../common/tenancy/tenant.errors';
import { GSC_UPSERT_BATCH_SIZE, GscStore, md5 } from './gsc-store';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';

function buildStore(orgId: string | null = 'org-1') {
  const query = jest.fn().mockResolvedValue([]);
  const cls = {
    isActive: () => true,
    get: () => orgId ?? undefined,
  } as unknown as ClsService<AppClsStore>;
  const store = new GscStore({ query } as unknown as DataSource, cls);
  return { store, query };
}

function pageRow(page: string, clicks = 1) {
  return {
    date: '2026-09-25',
    page,
    device: 'mobile',
    country: 'tur',
    clicks,
    impressions: 10,
    ctr: 0.1,
    position: 2.5,
  };
}

describe('GscStore', () => {
  it("md5 Postgres'in md5(text) çıktısıyla aynı biçimdedir", () => {
    expect(md5('seo araçları')).toMatch(/^[0-9a-f]{32}$/);
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it("satırları 1000'lik batch'lerle ON CONFLICT DO UPDATE olarak yazar", async () => {
    const { store, query } = buildStore();
    const rows = Array.from({ length: 2500 }, (_, i) =>
      pageRow(`https://example.com/${i}`),
    );

    await store.upsertPageRows(PROJECT_ID, rows);

    expect(query).toHaveBeenCalledTimes(3);
    const sizes = query.mock.calls.map(
      ([, parameters]: [string, unknown[]]) => parameters.length / 11,
    );
    expect(sizes).toEqual([GSC_UPSERT_BATCH_SIZE, GSC_UPSERT_BATCH_SIZE, 500]);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "gsc_page_daily"');
    expect(sql).toContain(
      'ON CONFLICT ("date", "project_id", "page_hash", "device", "country") DO UPDATE SET',
    );
    expect(sql).toContain('"clicks" = EXCLUDED."clicks"');
  });

  it("org_id'yi CLS'ten, hash'leri md5 olarak yazar", async () => {
    const { store, query } = buildStore('org-cls');

    await store.upsertQueryRows(PROJECT_ID, [
      { ...pageRow('https://example.com/a'), query: 'seo' },
    ]);

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "gsc_daily"');
    expect(sql).toContain(
      'ON CONFLICT ("date", "project_id", "query_hash", "page_hash", "country", "device")',
    );
    expect(parameters).toEqual([
      '2026-09-25',
      'org-cls',
      PROJECT_ID,
      'seo',
      md5('seo'),
      'https://example.com/a',
      md5('https://example.com/a'),
      'tur',
      'mobile',
      1,
      10,
      0.1,
      2.5,
    ]);
  });

  it("aynı batch'te tekrar eden PK'yı tekilleştirir (son gelen kazanır)", async () => {
    const { store, query } = buildStore();

    await store.upsertPageRows(PROJECT_ID, [
      pageRow('https://example.com/a', 1),
      pageRow('https://example.com/a', 7),
    ]);

    const [, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toHaveLength(11);
    expect(parameters[7]).toBe(7);
  });

  it('site satırları (project_id, date) üzerinden upsert edilir', async () => {
    const { store, query } = buildStore();

    await store.upsertSiteRows(PROJECT_ID, [
      { date: '2026-09-25', clicks: 3, impressions: 9, ctr: 0.3, position: 4 },
    ]);

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO "gsc_site_daily"');
    expect(sql).toContain('ON CONFLICT ("project_id", "date")');
    expect(parameters).toEqual([
      '2026-09-25',
      'org-1',
      PROJECT_ID,
      3,
      9,
      0.3,
      4,
    ]);
  });

  it('boş listede sorgu atmaz', async () => {
    const { store, query } = buildStore();

    await store.upsertSiteRows(PROJECT_ID, []);

    expect(query).not.toHaveBeenCalled();
  });

  it("CLS'te org yoksa yazmaz", async () => {
    const { store, query } = buildStore(null);

    await expect(store.upsertSiteRows(PROJECT_ID, [])).rejects.toBeInstanceOf(
      TenantContextMissingError,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
