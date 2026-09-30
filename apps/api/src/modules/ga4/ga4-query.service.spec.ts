import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  Ga4SortField,
  ListGa4LandingPagesQueryDto,
  SortOrder,
} from './dto/ga4-query.dto';
import { Ga4QueryService, resolveRange, totalsOf } from './ga4-query.service';
import { InvalidGa4DateRangeError } from './ga4.errors';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const HASH = '900150983cd24fb0d6963f7d28e17f72';
const TODAY = '2026-09-30';

function buildService() {
  const query = jest.fn((sql: string, _parameters?: unknown[]) => {
    void _parameters;
    if (sql.includes('COUNT(DISTINCT')) {
      return Promise.resolve([{ total: 42 }]);
    }
    if (sql.includes('GROUP BY "landing_page_hash"')) {
      return Promise.resolve([
        {
          hash: HASH,
          label: '/abc',
          sessions: 5,
          engagedSessions: 4,
          keyEvents: 1,
          totalRevenue: 9.5,
        },
      ]);
    }
    return Promise.resolve([
      {
        channelGroup: 'Organic Search',
        sessions: 10,
        engagedSessions: 8,
        keyEvents: 2,
        totalRevenue: 5,
      },
      {
        channelGroup: 'Direct',
        sessions: 30,
        engagedSessions: 20,
        keyEvents: 3,
        totalRevenue: 15,
      },
    ]);
  });
  const cls = {
    isActive: () => true,
    get: () => 'org-1',
  } as unknown as ClsService<AppClsStore>;
  const service = new Ga4QueryService({ query } as unknown as DataSource, cls);
  return { service, query };
}

function listQuery(
  overrides: Partial<ListGa4LandingPagesQueryDto> = {},
): ListGa4LandingPagesQueryDto {
  return Object.assign(new ListGa4LandingPagesQueryDto(), {
    page: 2,
    limit: 20,
    from: '2026-09-01',
    to: '2026-09-28',
    ...overrides,
  });
}

type QueryCall = [string, unknown[]];

describe('Ga4QueryService', () => {
  describe('overview', () => {
    it("ga4_daily'yi kanala göre gruplar ve genel toplamı hesaplar", async () => {
      const { service, query } = buildService();

      const result = await service.overview(
        PROJECT_ID,
        { from: '2026-09-01', to: '2026-09-02' },
        TODAY,
      );

      const [sql, parameters] = query.mock.calls[0] as QueryCall;
      expect(sql).toContain('FROM "ga4_daily"');
      expect(sql).toContain('GROUP BY "channel_group"');
      expect(parameters).toEqual([
        'org-1',
        PROJECT_ID,
        '2026-09-01',
        '2026-09-02',
      ]);
      expect(result.channels).toHaveLength(2);
      expect(result.totals).toEqual({
        sessions: 40,
        engagedSessions: 28,
        keyEvents: 5,
        totalRevenue: 20,
      });
    });
  });

  describe('landingPages', () => {
    it('landing_page_hash ile gruplar, sayfalar ve sıralar', async () => {
      const { service, query } = buildService();

      const result = await service.landingPages(
        PROJECT_ID,
        listQuery({ sort: Ga4SortField.KeyEvents, order: SortOrder.Asc }),
        TODAY,
      );

      const [countSql, countParams] = query.mock.calls[0] as QueryCall;
      expect(countSql).toContain('COUNT(DISTINCT "landing_page_hash")');
      expect(countSql).toContain('FROM "ga4_daily"');
      expect(countParams).toEqual([
        'org-1',
        PROJECT_ID,
        '2026-09-01',
        '2026-09-28',
      ]);
      const [sql, parameters] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('GROUP BY "landing_page_hash"');
      expect(sql).toContain('ORDER BY "keyEvents" ASC, "hash" ASC');
      expect(parameters.slice(-2)).toEqual([20, 20]);
      expect(result).toEqual({
        items: [
          {
            landingPageHash: HASH,
            landingPage: '/abc',
            sessions: 5,
            engagedSessions: 4,
            keyEvents: 1,
            totalRevenue: 9.5,
          },
        ],
        total: 42,
        page: 2,
        limit: 20,
      });
    });

    it('channel filtresini sorgu tarafında uygular', async () => {
      const { service, query } = buildService();

      await service.landingPages(
        PROJECT_ID,
        listQuery({ channel: 'Organic Search' }),
        TODAY,
      );

      const [sql, parameters] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('"channel_group" = $5');
      expect(parameters[4]).toBe('Organic Search');
    });

    it('search ILIKE ile ve LIKE karakterleri kaçışlı uygulanır', async () => {
      const { service, query } = buildService();

      await service.landingPages(
        PROJECT_ID,
        listQuery({ search: '50%_indirim' }),
        TODAY,
      );

      const [sql, parameters] = query.mock.calls[1] as QueryCall;
      expect(sql).toContain('"landing_page" ILIKE $5');
      expect(parameters[4]).toBe('%50\\%\\_indirim%');
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
      ).toThrow(InvalidGa4DateRangeError);
      expect(() =>
        resolveRange({ from: '2026-02-30', to: '2026-03-01' }, TODAY),
      ).toThrow(InvalidGa4DateRangeError);
    });

    it('totalsOf boş listede sıfır döner', () => {
      expect(totalsOf([])).toEqual({
        sessions: 0,
        engagedSessions: 0,
        keyEvents: 0,
        totalRevenue: 0,
      });
    });
  });
});
