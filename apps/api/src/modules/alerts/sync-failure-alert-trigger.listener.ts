import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import {
  SYNC_FAILED_EVENT,
  SyncFailedEvent,
} from '../../common/events/sync-failed.event';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { AlertEvalJobData, QueueName } from '../../infra/queue/queues';

/**
 * `sync.failed` sonrası `alert-eval` job'unu hemen tetikler (T1.14
 * `sync_failure` alert'i, ARCHITECTURE §11): connection `error`'a düştüğü
 * anda, günlük `summary` job'unu beklemeden değerlendirilir.
 * `SummaryTriggerListener`'daki kalıp: hata yalnız loglanır, akışı bozmaz.
 */
@Injectable()
export class SyncFailureAlertTriggerListener {
  private readonly logger = new Logger(SyncFailureAlertTriggerListener.name);

  constructor(
    @InjectQueue(QueueName.AlertEval)
    private readonly alertEvalQueue: Queue<AlertEvalJobData>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @OnEvent(SYNC_FAILED_EVENT, { async: true, promisify: true })
  async onSyncFailed(event: SyncFailedEvent): Promise<void> {
    try {
      await runInTenant(this.cls, event.orgId, () =>
        this.alertEvalQueue.add(QueueName.AlertEval, {
          orgId: event.orgId,
          projectId: event.projectId,
        }),
      );
    } catch (error) {
      this.logger.error(
        `alert-eval job eklenemedi: orgId=${event.orgId} projectId=${event.projectId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
