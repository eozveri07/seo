import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnrecoverableError } from 'bullmq';
import { SYNC_COMPLETED_EVENT } from '../../common/events/sync-completed.event';
import { SYNC_FAILED_EVENT } from '../../common/events/sync-failed.event';
import {
  ConnectorAuthError,
  ConnectorQuotaError,
  ConnectorTransientError,
} from '../../connectors/errors';
import { Ga4Client, Ga4RunReportResult } from '../../connectors/ga4/ga4.client';
import { ConnectionsService } from '../connections/connections.service';
import {
  Connection,
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import { GA4_ROW_LIMIT, Ga4SyncService } from './ga4-sync.service';
import { Ga4Store } from './ga4-store';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000e';
const CONNECTION_ID = '0190f0e4-0000-7000-8000-000000000020';
const PROPERTY = 'properties/123456789';

function reportRow(
  date: string,
  landingPage: string,
  channelGroup: string,
  sessions = 1,
): Ga4RunReportResult['rows'][number] {
  return {
    dimensionValues: [date, landingPage, channelGroup],
    metricValues: [String(sessions), '8', '2', '12.5'],
  };
}

function buildConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: CONNECTION_ID,
    orgId: 'org-1',
    projectId: PROJECT_ID,
    type: ConnectionType.Ga4,
    externalId: PROPERTY,
    status: ConnectionStatus.Active,
    ...overrides,
  } as Connection;
}

/** `startDate` başına sırayla dönecek sayfalar; sonrası boş. */
type PageScript = Record<string, Ga4RunReportResult['rows'][]>;

function buildService(
  options: {
    connection?: Connection | null;
    pages?: PageScript;
    error?: Error;
  } = {},
) {
  const pages = options.pages ?? {};
  const calls: { startDate: string; endDate: string; offset?: number }[] = [];
  const ga4Client = {
    runReport: jest.fn(
      (params: {
        startDate: string;
        endDate: string;
        offset?: number;
      }): Promise<Ga4RunReportResult> => {
        calls.push(params);
        if (options.error) {
          return Promise.reject(options.error);
        }
        const key = `${params.startDate}..${params.endDate}`;
        const script = pages[key] ?? [];
        let offset = 0;
        for (const page of script) {
          if (offset === (params.offset ?? 0)) {
            return Promise.resolve({
              dimensionHeaders: [],
              metricHeaders: [],
              rows: page,
            });
          }
          offset += page.length;
        }
        return Promise.resolve({
          dimensionHeaders: [],
          metricHeaders: [],
          rows: [],
        });
      },
    ),
  };
  const store = { upsertRows: jest.fn().mockResolvedValue(undefined) };
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
  const service = new Ga4SyncService(
    ga4Client as unknown as Ga4Client,
    store as unknown as Ga4Store,
    connectionsService as unknown as ConnectionsService,
    events as unknown as EventEmitter2,
  );
  return { service, ga4Client, calls, store, connectionsService, events };
}

describe('Ga4SyncService', () => {
  describe('fetchAllPages (sayfalama döngüsü)', () => {
    it("tam sayfa dönene kadar offset'i artırır, kısa sayfada durur", async () => {
      const fullPage = Array.from({ length: GA4_ROW_LIMIT }, () =>
        reportRow('20260925', '/a', 'Organic Search'),
      );
      const { service, calls } = buildService({
        pages: {
          '2026-09-25..2026-09-25': [
            fullPage,
            [reportRow('20260925', '/b', 'Direct')],
          ],
        },
      });
      const onPage = jest.fn().mockResolvedValue(undefined);

      const total = await service.fetchAllPages(
        PROPERTY,
        '2026-09-25',
        '2026-09-25',
        onPage,
      );

      expect(total).toBe(GA4_ROW_LIMIT + 1);
      expect(calls.map((c) => c.offset)).toEqual([0, GA4_ROW_LIMIT]);
      expect(onPage).toHaveBeenCalledTimes(2);
    });

    it('boş sonuçta tek istek yapar ve hiçbir şey yazmaz', async () => {
      const { service, calls } = buildService();
      const onPage = jest.fn();

      const total = await service.fetchAllPages(
        PROPERTY,
        '2026-09-25',
        '2026-09-25',
        onPage,
      );

      expect(total).toBe(0);
      expect(calls).toHaveLength(1);
      expect(onPage).not.toHaveBeenCalled();
    });
  });

  describe('syncRange', () => {
    it("GA4 `date` (YYYYMMDD) satırını ISO'ya çevirip store'a yazar", async () => {
      const { service, store } = buildService({
        pages: {
          '2026-09-25..2026-09-25': [
            [reportRow('20260925', '/a', 'Organic Search', 4)],
          ],
        },
      });

      const rows = await service.syncRange(
        buildConnection(),
        '2026-09-25',
        '2026-09-25',
      );

      expect(rows).toBe(1);
      expect(store.upsertRows).toHaveBeenCalledWith(PROJECT_ID, [
        {
          date: '2026-09-25',
          landingPage: '/a',
          channelGroup: 'Organic Search',
          sessions: 4,
          engagedSessions: 8,
          keyEvents: 2,
          totalRevenue: 12.5,
        },
      ]);
    });
  });

  describe('syncRecent', () => {
    it('bitiş gününden önceki son 3 günü tek istekte çeker ve lastSyncedAt yazar', async () => {
      const { service, calls, connectionsService } = buildService();

      const stats = await service.syncRecent(PROJECT_ID, '2026-09-30');

      expect(stats).toMatchObject({
        from: '2026-09-27',
        to: '2026-09-29',
        rows: 0,
      });
      expect(
        calls.map((c) => ({
          startDate: c.startDate,
          endDate: c.endDate,
          offset: c.offset,
        })),
      ).toEqual([
        { startDate: '2026-09-27', endDate: '2026-09-29', offset: 0 },
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
          source: 'ga4',
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
      'bağlantı %s ise GA4 çağrılmadan atlanır',
      async (_label, connection, reason) => {
        const { service, ga4Client } = buildService({ connection });

        const stats = await service.syncRecent(PROJECT_ID, '2026-09-30');

        expect(stats).toEqual({ skipped: reason });
        expect(ga4Client.runReport).not.toHaveBeenCalled();
      },
    );

    it("403'te bağlantı error olur, sync.failed yayılır ve yeniden denenmez", async () => {
      const { service, connectionsService, events } = buildService({
        error: new ConnectorAuthError('Forbidden'),
      });

      await expect(
        service.syncRecent(PROJECT_ID, '2026-09-30'),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(connectionsService.markSyncFailed).toHaveBeenCalledWith(
        CONNECTION_ID,
        'Forbidden',
      );
      expect(events.emit).toHaveBeenCalledWith(
        SYNC_FAILED_EVENT,
        expect.objectContaining({
          orgId: 'org-1',
          projectId: PROJECT_ID,
          connectionId: CONNECTION_ID,
          source: 'ga4',
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

      expect(result).toMatchObject({ date: '2025-06-01', rows: 0 });
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
