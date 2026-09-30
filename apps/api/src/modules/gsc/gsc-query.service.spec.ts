import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  GscCompareMode,
  GscSortField,
  ListGscRowsQueryDto,
  SortOrder,
} from './dto/gsc-query.dto';
import {
  compareRange,
  GscQueryService,
  resolveRange,
  totalsOf,
} from './gsc-query.service';
import { InvalidDateRangeError } from './gsc.errors';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const HASH = '900150983cd24fb0d6963f7d28e17f72';
const TODAY = '2026-09-30';

function buildService() {
  const query = jest.fn((sql: string, _parameters?: unknown[]) => {
    void _parameters;
    if (sql.includes('COUNT(DISTINCT')) {
      return Promise.resolve([{ total: 42 }]);
    }
    if (sql.includes('GROUP BY')) {
      return Promise.resolve([
        {
          hash: HASH,
          label: 'abc',
          clicks: 5,
          impressions: 50,
          ctr: 0.1,
          position: 2,
        },
      ]);
    }
    return Promise.resolve([
      {
        date: '2026-09-01',
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 2,
      },
      {
        date: '2026-09-02',
        clicks: 30,
        impressions: 300,
        ctr: 0.1,
        position: 4,
      },
    ]);
  });
  const cls = {
    isActive: () => true,
    get: () => 'org-1',
  } as unknown as ClsService<AppClsStore>;
  const service = new GscQueryService({ query } as unknown as DataSource, cls);
  return { service, query };
}

function listQuery(overrides: Partial<ListGscRowsQueryDto> = {}) {
  return Object.assign(new ListGscRowsQueryDto(), {
    page: 2,
    limit: 20,
    from: '2026-09-01',
    to: '2026-09-28',
    ...overrides,
  });
}

type QueryCall = [string, unknown[]];

describe('GscQueryService', () => {
  describe('overview', () => {
    it("site toplamını ve seriyi gsc_site_daily'den org, proje ve tarihle okur", async () => {
      const { service, query } = buildService();

      const result = await service.overview(
        PROJECT_ID,
        { from: '2026-09-01', to: '2026-09-02' },
        TODAY,
      );

      const [sql, parameters] = query.mock.calls[0] as QueryCall;
      expect(sql).toContain('FROM "gsc_site_daily"');
      expect(sql).toContain(
        '"org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4',
      );
      expect(parameters).toEqual([
        'org-1',
        PROJECT_ID,
        '2026-09-01',
        '2026-09-02',
      ]);
      expect(result.totals).toEqual({
        clicks: 40,
        impressions: 400,
        ctr: 0.1,
        position: 3.5,
      });
      expect(result.series).toHaveLength(2);
      expect(result.compare).toBeNull();
    });

    it('compare=previous ile önceki eşit uzunluktaki dönemi de döner', async () => {
      const { service, query } = buildService();

      const result = await service.overview(
        PROJECT_ID,
        {
          from: '2026-09-01',
          to: '2026-09-28',
          compare: GscCompareMode.Previous,
        },
        TODAY,
      );

      expect(query).toHaveBeenCalledTimes(2);
      expect((query.mock.calls[1] as QueryCall)[1]).toEqual([
        'org-1',
        PROJECT_ID,
        '2026-08-04',
        '2026-08-31',
      ]);
      expect(result.compare).toMatchObject({
        from: '2026-08-04',
        to: '2026-08-31',
      });
    });
  });

  describe('tablolar', () => {
    it("queries gsc_daily'den query_hash ile gruplar, sayfalar ve sıralar", async () => {
      const { service, query } = buildService();

      const result = await service.queries(
        PROJECT_ID,
        listQuery({ sort: GscSortField.Position, order: SortOrder.Asc }),
        TODAY,
      );

      const [countSql, countParams] = query.mock.calls[0] as QueryCall;
      expect(countSql).toContain('COUNT(DISTINCT "query_hash")');
      expect(countSql).toContain('FROM "gsc_daily"');
      expect(countParams).toEqual([
        'org-1',
        PROJECT_ID,
        '2026-09-01',
        '2026-09-28',
      ]);
      const [sql, parameters] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('FROM "gsc_daily"');
      expect(sql).toContain('GROUP BY "query_hash"');
      expect(sql).toContain('ORDER BY "position" ASC, "hash" ASC');
      expect(parameters.slice(-2)).toEqual([20, 20]);
      expect(result).toEqual({
        items: [
          {
            queryHash: HASH,
            query: 'abc',
            clicks: 5,
            impressions: 50,
            ctr: 0.1,
            position: 2,
          },
        ],
        total: 42,
        page: 2,
        limit: 20,
      });
    });

    it("pages gsc_page_daily'den page_hash ile gruplar", async () => {
      const { service, query } = buildService();

      const result = await service.pages(PROJECT_ID, listQuery(), TODAY);

      const [sql] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('FROM "gsc_page_daily"');
      expect(sql).toContain('GROUP BY "page_hash"');
      expect(sql).toContain('ORDER BY "clicks" DESC');
      expect(result.items[0]).toMatchObject({ pageHash: HASH, page: 'abc' });
    });

    it('search ILIKE ile ve LIKE karakterleri kaçışlı uygulanır', async () => {
      const { service, query } = buildService();

      await service.queries(
        PROJECT_ID,
        listQuery({ search: '50%_indirim' }),
        TODAY,
      );

      const [sql, parameters] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('"query" ILIKE $5');
      expect(parameters[4]).toBe('%50\\%\\_indirim%');
    });

    it("queryPages bir sorgunun sayfalarını gsc_daily'den döner", async () => {
      const { service, query } = buildService();

      const result = await service.queryPages(
        PROJECT_ID,
        HASH,
        listQuery(),
        TODAY,
      );

      const [sql, parameters] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('FROM "gsc_daily"');
      expect(sql).toContain('"query_hash" = $5');
      expect(sql).toContain('GROUP BY "page_hash"');
      expect(parameters[4]).toBe(HASH);
      expect(result.items[0]).toHaveProperty('pageHash', HASH);
    });

    it("pageQueries bir sayfanın sorgularını gsc_daily'den döner", async () => {
      const { service, query } = buildService();

      const result = await service.pageQueries(
        PROJECT_ID,
        HASH,
        listQuery(),
        TODAY,
      );

      const [sql] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('FROM "gsc_daily"');
      expect(sql).toContain('"page_hash" = $5');
      expect(sql).toContain('GROUP BY "query_hash"');
      expect(result.items[0]).toHaveProperty('queryHash', HASH);
    });
  });

  describe('yardımcılar', () => {
    it('resolveRange varsayılan olarak dünden geriye 28 gün döner', () => {
      expect(resolveRange({}, TODAY)).toEqual({
        from: '2026-09-02',
        to: '2026-09-29',
      });
    });

    it('resolveRange from > to ya da geçersiz günde hata verir', () => {
      expect(() =>
        resolveRange({ from: '2026-09-10', to: '2026-09-01' }, TODAY),
      ).toThrow(InvalidDateRangeError);
      expect(() =>
        resolveRange({ from: '2026-02-30', to: '2026-03-01' }, TODAY),
      ).toThrow(InvalidDateRangeError);
    });

    it('compareRange year bir yıl öncesini verir', () => {
      expect(
        compareRange(
          { from: '2026-09-01', to: '2026-09-28' },
          GscCompareMode.Year,
        ),
      ).toEqual({ from: '2025-09-01', to: '2025-09-28' });
    });

    it('totalsOf boş seride sıfır döner', () => {
      expect(totalsOf([])).toEqual({
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      });
    });
  });
});
