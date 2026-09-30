import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnrecoverableError } from 'bullmq';
import { addDays } from '../../common/dates/utc-date';
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
import { Ga4Client, Ga4RunReportResult } from '../../connectors/ga4/ga4.client';
import { ConnectionsService } from '../connections/connections.service';
import {
  Connection,
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import { Ga4Row, Ga4Store } from './ga4-store';

/** ARCHITECTURE §9.2: günlük sync son 3 günü yeniden yazar. */
export const GA4_SYNC_DAYS = 3;
/** ARCHITECTURE §9.2: `limit: 100000`, `offset` ile sayfalama. */
export const GA4_ROW_LIMIT = 100000;

/**
 * ARCHITECTURE §9.2: metrik ve dimension isimleri GA4 API'sinde değişebiliyor,
 * bu yüzden connector'ı çağıran tek yer olan burada sabit tutulur (CLAUDE.md
 * kural 5).
 */
export const GA4_DIMENSIONS = [
  'date',
  'landingPagePlusQueryString',
  'sessionDefaultChannelGroup',
] as const;
export const GA4_METRICS = [
  'sessions',
  'engagedSessions',
  'keyEvents',
  'totalRevenue',
] as const;

export interface Ga4DayStats {
  rows: number;
}

export interface Ga4SyncStats extends Ga4DayStats {
  from: string;
  to: string;
}

export type Ga4SkipReason = 'connection_missing' | 'connection_inactive';

export interface Ga4SkippedStats {
  skipped: Ga4SkipReason;
}

/**
 * GA4 → Postgres senkronizasyonu (ARCHITECTURE §9.2). T1.5'teki
 * `GscSyncService` kalıbını izler: processor'lar ince, iş mantığı burada.
 * Hata yönetimi aynı: 429/5xx olduğu gibi fırlatılır (BullMQ backoff),
 * 401/403 bağlantıyı `error`'a çeker, `sync.failed` yayar ve yeniden
 * denenmez.
 */
@Injectable()
export class Ga4SyncService {
  private readonly logger = new Logger(Ga4SyncService.name);

  constructor(
    private readonly ga4Client: Ga4Client,
    private readonly store: Ga4Store,
    private readonly connectionsService: ConnectionsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Günlük/manuel sync: `endDate`'ten önceki son 3 gün (`endDate` hariç), tek istek. */
  async syncRecent(
    projectId: string,
    endDate: string,
  ): Promise<Ga4SyncStats | Ga4SkippedStats> {
    const connection = await this.findActiveConnection(projectId);
    if ('skipped' in connection) {
      return connection;
    }
    const from = addDays(endDate, -GA4_SYNC_DAYS);
    const to = addDays(endDate, -1);

    const rows = await this.withErrorHandling(connection, () =>
      this.syncRange(connection, from, to),
    );
    await this.connectionsService.markSynced(connection.id);
    this.events.emit(
      SYNC_COMPLETED_EVENT,
      new SyncCompletedEvent(connection.orgId, connection.projectId, to, 'ga4'),
    );
    return { from, to, rows };
  }

  /**
   * Backfill'in tek günü. Başarıda `backfill_progress.done` artar. Son deneme
   * de başarısızsa (ya da hata kalıcıysa) backfill `failed` olur.
   */
  async syncBackfillDay(
    projectId: string,
    date: string,
    finalAttempt: boolean,
  ): Promise<(Ga4DayStats & { date: string }) | Ga4SkippedStats> {
    const connection = await this.findActiveConnection(projectId);
    if ('skipped' in connection) {
      return connection;
    }
    try {
      const rows = await this.withErrorHandling(connection, () =>
        this.syncRange(connection, date, date),
      );
      await this.connectionsService.recordBackfillDayDone(connection.id);
      return { date, rows };
    } catch (error) {
      if (finalAttempt || error instanceof UnrecoverableError) {
        await this.connectionsService.markBackfillFailed(connection.id);
      }
      throw error;
    }
  }

  /** `from`..`to` (dahil) tek bir GA4 raporu; sayfalar geldiği gibi yazılır. */
  async syncRange(
    connection: Connection,
    from: string,
    to: string,
  ): Promise<number> {
    return this.fetchAllPages(connection.externalId, from, to, (rows) =>
      this.store.upsertRows(connection.projectId, rows),
    );
  }

  /**
   * ARCHITECTURE §9.2: `limit: 100000`, boş/eksik sayfa dönene kadar `offset`
   * artırılır. Her sayfa geldiği gibi yazılır; bellekte tüm aralık tutulmaz.
   * Toplam satır sayısını döner.
   */
  async fetchAllPages(
    property: string,
    startDate: string,
    endDate: string,
    onPage: (rows: Ga4Row[]) => Promise<void>,
  ): Promise<number> {
    let offset = 0;
    let total = 0;
    for (;;) {
      const result = await this.ga4Client.runReport({
        property,
        startDate,
        endDate,
        dimensions: [...GA4_DIMENSIONS],
        metrics: [...GA4_METRICS],
        limit: GA4_ROW_LIMIT,
        offset,
      });
      if (result.rows.length === 0) {
        return total;
      }
      await onPage(result.rows.map(toGa4Row));
      total += result.rows.length;
      offset += result.rows.length;
      if (result.rows.length < GA4_ROW_LIMIT) {
        return total;
      }
    }
  }

  private async findActiveConnection(
    projectId: string,
  ): Promise<Connection | Ga4SkippedStats> {
    const connection = await this.connectionsService.findByProjectAndType(
      projectId,
      ConnectionType.Ga4,
    );
    if (!connection) {
      this.logger.warn(`GA4 bağlantısı yok, atlandı: projectId=${projectId}`);
      return { skipped: 'connection_missing' };
    }
    if (connection.status !== ConnectionStatus.Active) {
      this.logger.warn(
        `GA4 bağlantısı aktif değil (${connection.status}), atlandı: projectId=${projectId}`,
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
            'ga4',
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

function toGa4Row(row: Ga4RunReportResult['rows'][number]): Ga4Row {
  const [date, landingPage, channelGroup] = row.dimensionValues;
  const [sessions, engagedSessions, keyEvents, totalRevenue] = row.metricValues;
  return {
    date: normalizeGa4Date(date),
    landingPage,
    channelGroup,
    sessions: Number(sessions),
    engagedSessions: Number(engagedSessions),
    keyEvents: Number(keyEvents),
    totalRevenue: Number(totalRevenue),
  };
}

/** GA4 `date` dimension'ı `YYYYMMDD` döner; tabloda `YYYY-MM-DD` (§5.4). */
function normalizeGa4Date(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
