import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnrecoverableError } from 'bullmq';
import { SYNC_COMPLETED_EVENT } from '../../common/events/sync-completed.event';
import { SYNC_FAILED_EVENT } from '../../common/events/sync-failed.event';
import {
  ConnectorAuthError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../../connectors/errors';
import {
  GscClient,
  GscSearchAnalyticsQueryParams,
  GscSearchAnalyticsRow,
} from '../../connectors/gsc/gsc.client';
import { ConnectionsService } from '../connections/connections.service';
import {
  Connection,
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import { GscStore } from './gsc-store';
import { GSC_ROW_LIMIT, GscSyncService } from './gsc-sync.service';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const CONNECTION_ID = '0190f0e4-0000-7000-8000-000000000020';
const SITE_URL = 'sc-domain:example.com';

function row(keys: string[], clicks = 1): GscSearchAnalyticsRow {
  return { keys, clicks, impressions: 10, ctr: 0.1, position: 3.5 };
}

function rows(count: number, keys: string[]): GscSearchAnalyticsRow[] {
  return Array.from({ length: count }, () => row(keys));
}

function buildConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: CONNECTION_ID,
    orgId: 'org-1',
    projectId: PROJECT_ID,
    type: ConnectionType.Gsc,
    externalId: SITE_URL,
    status: ConnectionStatus.Active,
    ...overrides,
  } as Connection;
}

/** Her (boyut, gün) için sırayla dönecek sayfalar; sonrası boş. */
type PageScript = Record<string, GscSearchAnalyticsRow[][]>;

function buildService(
  options: {
    connection?: Connection | null;
    pages?: PageScript;
    error?: Error;
  } = {},
) {
  const pages = options.pages ?? {};
  const calls: GscSearchAnalyticsQueryParams[] = [];
  const gscClient = {
    searchAnalyticsQuery: jest.fn((params: GscSearchAnalyticsQueryParams) => {
      calls.push(params);
      if (options.error) {
        return Promise.reject(options.error);
      }
      const key = `${params.dimensions.join(',')}@${params.startDate}`;
      const script = pages[key] ?? [];
      let offset = 0;
      for (const page of script) {
        if (offset === (params.startRow ?? 0)) {
          return Promise.resolve(page);
        }
        offset += page.length;
      }
      return Promise.resolve([]);
    }),
  };
  const store = {
    upsertSiteRows: jest.fn().mockResolvedValue(undefined),
    upsertPageRows: jest.fn().mockResolvedValue(undefined),
    upsertQueryRows: jest.fn().mockResolvedValue(undefined),
  };
  const connectionsService = {
    findByProjectAndType: jest
      .fn()
      .mockResolvedValue(
        options.connection === undefined
          ? buildConnection()
          : options.connection,
      ),
    markSynced: jest.fn().mockResolvedValue(undefined),
    markSyncFailed: jest.fn().mockResolvedValue(undefined),
    recordBackfillDayDone: jest.fn().mockResolvedValue(undefined),
    markBackfillFailed: jest.fn().mockResolvedValue(undefined),
  };
  const events = { emit: jest.fn() };
  const service = new GscSyncService(
    gscClient as unknown as GscClient,
    store as unknown as GscStore,
    connectionsService as unknown as ConnectionsService,
    events as unknown as EventEmitter2,
  );
  return { service, gscClient, calls, store, connectionsService, events };
}

describe('GscSyncService', () => {
  describe('fetchAllPages (sayfalama döngüsü)', () => {
    it("boş sayfa dönene kadar startRow'u artırır ve her sayfayı yazar", async () => {
      const { service, calls } = buildService({
        pages: {
          'date,query,page,device,country@2026-09-25': [
            rows(GSC_ROW_LIMIT, ['2026-09-25', 'q', 'p', 'MOBILE', 'tur']),
            rows(GSC_ROW_LIMIT, ['2026-09-25', 'q', 'p', 'MOBILE', 'tur']),
            rows(3, ['2026-09-25', 'q', 'p', 'MOBILE', 'tur']),
          ],
        },
      });
      const onPage = jest.fn((page: GscSearchAnalyticsRow[]) => {
        void page;
        return Promise.resolve();
      });

      const total = await service.fetchAllPages(
        SITE_URL,
        '2026-09-25',
        ['date', 'query', 'page', 'device', 'country'],
        onPage,
      );

      expect(total).toBe(2 * GSC_ROW_LIMIT + 3);
      expect(calls.map((c) => c.startRow)).toEqual([
        0,
        GSC_ROW_LIMIT,
        2 * GSC_ROW_LIMIT,
        2 * GSC_ROW_LIMIT + 3,
      ]);
      expect(onPage.mock.calls.map(([page]) => page.length)).toEqual([
        GSC_ROW_LIMIT,
        GSC_ROW_LIMIT,
        3,
      ]);
      for (const call of calls) {
        expect(call).toMatchObject({
          siteUrl: SITE_URL,
          startDate: '2026-09-25',
          endDate: '2026-09-25',
          rowLimit: 25000,
          dataState: 'all',
        });
      }
    });

    it('ilk sayfa boşsa tek istek yapar ve hiçbir şey yazmaz', async () => {
      const { service, calls } = buildService();
      const onPage = jest.fn();

      const total = await service.fetchAllPages(
        SITE_URL,
        '2026-09-25',
        ['date'],
        onPage,
      );

      expect(total).toBe(0);
      expect(calls).toHaveLength(1);
      expect(onPage).not.toHaveBeenCalled();
    });
  });

  describe('syncDay', () => {
    it('site, page ve query aşamalarını sırayla çekip doğru tabloya yazar', async () => {
      const date = '2026-09-25';
      const { service, calls, store } = buildService({
        pages: {
          [`date@${date}`]: [[row([date], 100)]],
          [`date,page,device,country@${date}`]: [
            [row([date, 'https://example.com/a', 'DESKTOP', 'TUR'], 60)],
          ],
          [`date,query,page,device,country@${date}`]: [
            [
              row(
                [
                  date,
                  'seo araçları',
                  'https://example.com/a',
                  'MOBILE',
                  'deu',
                ],
                40,
              ),
            ],
          ],
        },
      });

      const stats = await service.syncDay(buildConnection(), date);

      expect(stats).toEqual({ siteRows: 1, pageRows: 1, queryRows: 1 });
      expect(calls.map((c) => c.dimensions)).toEqual([
        ['date'],
        ['date'],
        ['date', 'page', 'device', 'country'],
        ['date', 'page', 'device', 'country'],
        ['date', 'query', 'page', 'device', 'country'],
        ['date', 'query', 'page', 'device', 'country'],
      ]);
      expect(store.upsertSiteRows).toHaveBeenCalledWith(PROJECT_ID, [
        { date, clicks: 100, impressions: 10, ctr: 0.1, position: 3.5 },
      ]);
      expect(store.upsertPageRows).toHaveBeenCalledWith(PROJECT_ID, [
        {
          date,
          page: 'https://example.com/a',
          device: 'desktop',
          country: 'tur',
          clicks: 60,
          impressions: 10,
          ctr: 0.1,
          position: 3.5,
        },
      ]);
      expect(store.upsertQueryRows).toHaveBeenCalledWith(PROJECT_ID, [
        expect.objectContaining({
          query: 'seo araçları',
          page: 'https://example.com/a',
          device: 'mobile',
          country: 'deu',
        }),
      ]);
    });
  });

  describe('syncRecent', () => {
    it('bitiş gününden önceki son 5 günü çeker ve lastSyncedAt yazar', async () => {
      const { service, calls, connectionsService } = buildService();

      const stats = await service.syncRecent(PROJECT_ID, '2026-09-30');

      expect(stats).toMatchObject({
        from: '2026-09-25',
        to: '2026-09-29',
        days: 5,
      });
      const siteDays = calls
        .filter((c) => c.dimensions.length === 1)
        .map((c) => c.startDate);
      expect(siteDays).toEqual([
        '2026-09-25',
        '2026-09-26',
        '2026-09-27',
        '2026-09-28',
        '2026-09-29',
      ]);
      expect(connectionsService.markSynced).toHaveBeenCalledWith(CONNECTION_ID);
    });

    it("başarıda sync.completed'ı senkronize edilen son günle (to) yayar (T1.10 summary tetikleyicisi)", async () => {
      const { service, events } = buildService();

      await service.syncRecent(PROJECT_ID, '2026-09-30');

      expect(events.emit).toHaveBeenCalledWith(
        SYNC_COMPLETED_EVENT,
        expect.objectContaining({
          orgId: 'org-1',
          projectId: PROJECT_ID,
          date: '2026-09-29',
          source: 'gsc',
        }),
      );
    });

    it.each([
      ['yok', null, 'connection_missing'],
      [
        'error durumunda',
        buildConnection({ status: ConnectionStatus.Error }),
        'connection_inactive',
      ],
    ])(
      'bağlantı %s ise GSC çağrılmadan atlanır',
      async (_label, connection, reason) => {
        const { service, gscClient } = buildService({ connection });

        const stats = await service.syncRecent(PROJECT_ID, '2026-09-30');

        expect(stats).toEqual({ skipped: reason });
        expect(gscClient.searchAnalyticsQuery).not.toHaveBeenCalled();
      },
    );

    it("403'te bağlantı error olur, sync.failed yayılır ve yeniden denenmez", async () => {
      const { service, connectionsService, events } = buildService({
        error: new ConnectorAuthError(
          'User does not have sufficient permission',
        ),
      });

      await expect(
        service.syncRecent(PROJECT_ID, '2026-09-30'),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(connectionsService.markSyncFailed).toHaveBeenCalledWith(
        CONNECTION_ID,
        'User does not have sufficient permission',
      );
      expect(events.emit).toHaveBeenCalledWith(
        SYNC_FAILED_EVENT,
        expect.objectContaining({
          orgId: 'org-1',
          projectId: PROJECT_ID,
          connectionId: CONNECTION_ID,
          source: 'gsc',
        }),
      );
      expect(connectionsService.markSynced).not.toHaveBeenCalled();
    });

    it.each([
      ['429', new ConnectorQuotaError('Quota exceeded')],
      ['5xx', new ConnectorTransientError('Backend Error')],
    ])(
      '%s hatası BullMQ backoff için olduğu gibi fırlatılır',
      async (_label, error) => {
        const { service, connectionsService, events } = buildService({
          error,
        });

        await expect(service.syncRecent(PROJECT_ID, '2026-09-30')).rejects.toBe(
          error,
        );
        expect(connectionsService.markSyncFailed).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
      },
    );
  });

  describe('syncBackfillDay', () => {
    it('başarıda backfill ilerlemesini artırır', async () => {
      const { service, connectionsService } = buildService();

      const result = await service.syncBackfillDay(
        PROJECT_ID,
        '2025-06-01',
        false,
      );

      expect(result).toMatchObject({ date: '2025-06-01' });
      expect(connectionsService.recordBackfillDayDone).toHaveBeenCalledWith(
        CONNECTION_ID,
      );
    });

    it('yeniden denenecek hatada backfill failed olmaz', async () => {
      const { service, connectionsService } = buildService({
        error: new ConnectorQuotaError('Quota exceeded'),
      });

      await expect(
        service.syncBackfillDay(PROJECT_ID, '2025-06-01', false),
      ).rejects.toBeInstanceOf(ConnectorQuotaError);
      expect(connectionsService.markBackfillFailed).not.toHaveBeenCalled();
      expect(connectionsService.recordBackfillDayDone).not.toHaveBeenCalled();
    });

    it('son denemede ya da 403te backfill failed olur', async () => {
      const lastAttempt = buildService({
        error: new ConnectorTransientError('Backend Error'),
      });
      await expect(
        lastAttempt.service.syncBackfillDay(PROJECT_ID, '2025-06-01', true),
      ).rejects.toBeInstanceOf(ConnectorTransientError);
      expect(
        lastAttempt.connectionsService.markBackfillFailed,
      ).toHaveBeenCalledWith(CONNECTION_ID);

      const forbidden = buildService({
        error: new ConnectorAuthError('Forbidden'),
      });
      await expect(
        forbidden.service.syncBackfillDay(PROJECT_ID, '2025-06-01', false),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(
        forbidden.connectionsService.markBackfillFailed,
      ).toHaveBeenCalledWith(CONNECTION_ID);
    });
  });
});
