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
import { GscJobsService } from './gsc-jobs.service';

/**
 * `connection.activated` (T1.4): GSC bağlantısı aktifleşince 16 aylık
 * backfill başlar. Hata doğrulama isteğini bozmaz, yalnız loglanır.
 */
@Injectable()
export class ConnectionActivatedListener {
  private readonly logger = new Logger(ConnectionActivatedListener.name);

  constructor(
    private readonly gscJobs: GscJobsService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @OnEvent(CONNECTION_ACTIVATED_EVENT, { async: true, promisify: true })
  async handle(event: ConnectionActivatedEvent): Promise<void> {
    if (event.type !== ConnectionType.Gsc) {
      return;
    }
    try {
      await runInTenant(this.cls, event.orgId, () =>
        this.gscJobs.startBackfill(event.orgId, event.projectId, todayUtc()),
      );
    } catch (error) {
      this.logger.error(
        `GSC backfill başlatılamadı: orgId=${event.orgId} projectId=${event.projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
