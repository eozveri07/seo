import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnrecoverableError } from 'bullmq';
import { addDays, dateRange } from '../../common/dates/utc-date';
import {
  SYNC_COMPLETED_EVENT,
  SyncCompletedEvent,
} from '../../common/events/sync-completed.event';
import {
  SYNC_FAILED_EVENT,
  SyncFailedEvent,
} from '../../common/events/sync-failed.event';
import {
  ConnectorAuthError,
  ConnectorPermanentError,
} from '../../connectors/errors';
import {
  GscClient,
  GscSearchAnalyticsRow,
} from '../../connectors/gsc/gsc.client';
import { ConnectionsService } from '../connections/connections.service';
import {
  Connection,
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import { GscStore } from './gsc-store';

/** ARCHITECTURE §9.1: günlük sync son 5 günü yeniden yazar (GSC 2-3 gün gecikmeli kesinleşir). */
export const GSC_SYNC_DAYS = 5;
/** ARCHITECTURE §9.1: sayfa boyutu (GSC API üst sınırı). */
export const GSC_ROW_LIMIT = 25000;

export interface GscDayStats {
  siteRows: number;
  pageRows: number;
  queryRows: number;
}

export interface GscSyncStats extends GscDayStats {
  from: string;
  to: string;
  days: number;
}

export type GscSkipReason = 'connection_missing' | 'connection_inactive';

export interface GscSkippedStats {
  skipped: GscSkipReason;
}

/** ARCHITECTURE §9.1'deki üç aşama, sırasıyla. */
const STAGE_DIMENSIONS = {
  site: ['date'],
  page: ['date', 'page', 'device', 'country'],
  query: ['date', 'query', 'page', 'device', 'country'],
} as const;

/**
 * GSC → Postgres senkronizasyonu (ARCHITECTURE §9.1). Processor'lar ince;
 * iş mantığı burada (CLAUDE.md kural 3). Tenant context'i processor kurar.
 *
 * Hata yönetimi: 429 ve 5xx (`ConnectorQuotaError`/`ConnectorTransientError`)
 * olduğu gibi fırlatılır, BullMQ exponential backoff ile yeniden dener. 401/403
 * (`ConnectorAuthError`) bağlantıyı `error`'a çeker, `sync.failed` yayar ve
 * yeniden denenmez (`UnrecoverableError`); diğer 4xx de yeniden denenmez.
 */
@Injectable()
export class GscSyncService {
  private readonly logger = new Logger(GscSyncService.name);

  constructor(
    private readonly gscClient: GscClient,
    private readonly store: GscStore,
    private readonly connectionsService: ConnectionsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Günlük/manuel sync: `endDate`'ten önceki son 5 gün (`endDate` hariç). */
  async syncRecent(
    projectId: string,
    endDate: string,
  ): Promise<GscSyncStats | GscSkippedStats> {
    const connection = await this.findActiveConnection(projectId);
    if ('skipped' in connection) {
      return connection;
    }
    const from = addDays(endDate, -GSC_SYNC_DAYS);
    const to = addDays(endDate, -1);
    const stats: GscSyncStats = {
      from,
      to,
      days: 0,
      siteRows: 0,
      pageRows: 0,
      queryRows: 0,
    };

    await this.withErrorHandling(connection, async () => {
      for (const date of dateRange(from, to)) {
        const day = await this.syncDay(connection, date);
        stats.days += 1;
        stats.siteRows += day.siteRows;
        stats.pageRows += day.pageRows;
        stats.queryRows += day.queryRows;
      }
    });
    await this.connectionsService.markSynced(connection.id);
    this.events.emit(
      SYNC_COMPLETED_EVENT,
      new SyncCompletedEvent(connection.orgId, connection.projectId, to, 'gsc'),
    );
    return stats;
  }

  /**
   * Backfill'in tek günü. Başarıda `backfill_progress.done` artar. Son deneme
   * de başarısızsa (ya da hata kalıcıysa) backfill `failed` olur.
   */
  async syncBackfillDay(
    projectId: string,
    date: string,
    finalAttempt: boolean,
  ): Promise<(GscDayStats & { date: string }) | GscSkippedStats> {
    const connection = await this.findActiveConnection(projectId);
    if ('skipped' in connection) {
      return connection;
    }
    try {
      const day = await this.withErrorHandling(connection, () =>
        this.syncDay(connection, date),
      );
      await this.connectionsService.recordBackfillDayDone(connection.id);
      return { date, ...day };
    } catch (error) {
      if (finalAttempt || error instanceof UnrecoverableError) {
        await this.connectionsService.markBackfillFailed(connection.id);
      }
      throw error;
    }
  }

  // Bir günün üç aşaması sırasıyla: site, page, query.
  async syncDay(connection: Connection, date: string): Promise<GscDayStats> {
    const { projectId, externalId } = connection;

    const siteRows = await this.fetchAllPages(
      externalId,
      date,
      STAGE_DIMENSIONS.site,
      (rows) =>
        this.store.upsertSiteRows(
          projectId,
          rows.map((row) => ({ date: row.keys[0], ...metrics(row) })),
        ),
    );
    const pageRows = await this.fetchAllPages(
      externalId,
      date,
      STAGE_DIMENSIONS.page,
      (rows) =>
        this.store.upsertPageRows(
          projectId,
          rows.map((row) => ({
            date: row.keys[0],
            page: row.keys[1],
            device: normalizeDevice(row.keys[2]),
            country: normalizeCountry(row.keys[3]),
            ...metrics(row),
          })),
        ),
    );
    const queryRows = await this.fetchAllPages(
      externalId,
      date,
      STAGE_DIMENSIONS.query,
      (rows) =>
        this.store.upsertQueryRows(
          projectId,
          rows.map((row) => ({
            date: row.keys[0],
            query: row.keys[1],
            page: row.keys[2],
            device: normalizeDevice(row.keys[3]),
            country: normalizeCountry(row.keys[4]),
            ...metrics(row),
          })),
        ),
    );

    return { siteRows, pageRows, queryRows };
  }

  /**
   * ARCHITECTURE §9.1: `rowLimit: 25000`, boş sayfa dönene kadar `startRow`
   * artırılır, `dataState: 'all'`. Her sayfa geldiği gibi yazılır; bellekte
   * tüm gün tutulmaz. Toplam satır sayısını döner.
   */
  async fetchAllPages(
    siteUrl: string,
    date: string,
    dimensions: readonly string[],
    onPage: (rows: GscSearchAnalyticsRow[]) => Promise<void>,
  ): Promise<number> {
    let startRow = 0;
    for (;;) {
      const rows = await this.gscClient.searchAnalyticsQuery({
        siteUrl,
        startDate: date,
        endDate: date,
        dimensions: [...dimensions],
        rowLimit: GSC_ROW_LIMIT,
        startRow,
        dataState: 'all',
      });
      if (rows.length === 0) {
        return startRow;
      }
      await onPage(rows);
      startRow += rows.length;
    }
  }

  private async findActiveConnection(
    projectId: string,
  ): Promise<Connection | GscSkippedStats> {
    const connection = await this.connectionsService.findByProjectAndType(
      projectId,
      ConnectionType.Gsc,
    );
    if (!connection) {
      this.logger.warn(`GSC bağlantısı yok, atlandı: projectId=${projectId}`);
      return { skipped: 'connection_missing' };
    }
    if (connection.status !== ConnectionStatus.Active) {
      this.logger.warn(
        `GSC bağlantısı aktif değil (${connection.status}), atlandı: projectId=${projectId}`,
      );
      return { skipped: 'connection_inactive' };
    }
    return connection;
  }

  private async withErrorHandling<T>(
    connection: Connection,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ConnectorAuthError) {
        await this.connectionsService.markSyncFailed(
          connection.id,
          error.message,
        );
        this.events.emit(
          SYNC_FAILED_EVENT,
          new SyncFailedEvent(
            connection.orgId,
            connection.projectId,
            connection.id,
            'gsc',
            error.message,
          ),
        );
        throw new UnrecoverableError(error.message);
      }
      if (error instanceof ConnectorPermanentError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}

function metrics(row: GscSearchAnalyticsRow) {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

/** GSC `DESKTOP`/`MOBILE`/`TABLET` döner; tabloda küçük harf (§5.3). */
function normalizeDevice(value: string): string {
  return value.toLowerCase();
}

/** GSC ISO alpha-3 küçük harf döner (`tur`); yine de normalize edilir. */
function normalizeCountry(value: string): string {
  return value.toLowerCase();
}
