import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { todayUtc } from '../../common/dates/utc-date';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { ConnectionType } from '../connections/entities/connection.entity';
import {
  CONNECTION_ACTIVATED_EVENT,
  ConnectionActivatedEvent,
} from '../connections/events/connection-activated.event';
import { Ga4JobsService } from './ga4-jobs.service';

/**
 * `connection.activated` (T1.4): GA4 bağlantısı aktifleşince 14 aylık
 * backfill başlar. Hata doğrulama isteğini bozmaz, yalnız loglanır.
 * T1.5'teki GSC `ConnectionActivatedListener` kalıbı.
 */
@Injectable()
export class ConnectionActivatedListener {
  private readonly logger = new Logger(ConnectionActivatedListener.name);

  constructor(
    private readonly ga4Jobs: Ga4JobsService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @OnEvent(CONNECTION_ACTIVATED_EVENT, { async: true, promisify: true })
  async handle(event: ConnectionActivatedEvent): Promise<void> {
    if (event.type !== ConnectionType.Ga4) {
      return;
    }
    try {
      await runInTenant(this.cls, event.orgId, () =>
        this.ga4Jobs.startBackfill(event.orgId, event.projectId, todayUtc()),
      );
    } catch (error) {
      this.logger.error(
        `GA4 backfill başlatılamadı: orgId=${event.orgId} projectId=${event.projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
