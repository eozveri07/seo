import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import {
  RANK_DAY_COMPLETED_EVENT,
  RankDayCompletedEvent,
} from '../../common/events/rank-day-completed.event';
import {
  SYNC_COMPLETED_EVENT,
  SyncCompletedEvent,
} from '../../common/events/sync-completed.event';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { SummaryJobsService } from './summary-jobs.service';

/**
 * `sync.completed` (gsc/ga4) ve `rank.day_completed` sonrası `summary`
 * job'unu tetikler (ARCHITECTURE §10). Her event kendi `date`'i için bir
 * job ekler; deterministik jobId aynı güne birden fazla tetiklemeyi tek
 * job'a düşürür. Hata dinlenen akışı bozmaz, yalnız loglanır.
 */
@Injectable()
export class SummaryTriggerListener {
  private readonly logger = new Logger(SummaryTriggerListener.name);

  constructor(
    private readonly summaryJobs: SummaryJobsService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @OnEvent(SYNC_COMPLETED_EVENT, { async: true, promisify: true })
  async onSyncCompleted(event: SyncCompletedEvent): Promise<void> {
    await this.trigger(event.orgId, event.projectId, event.date);
  }

  @OnEvent(RANK_DAY_COMPLETED_EVENT, { async: true, promisify: true })
  async onRankDayCompleted(event: RankDayCompletedEvent): Promise<void> {
    await this.trigger(event.orgId, event.projectId, event.date);
  }

  private async trigger(
    orgId: string,
    projectId: string,
    date: string,
  ): Promise<void> {
    try {
      await runInTenant(this.cls, orgId, () =>
        this.summaryJobs.enqueue(orgId, projectId, date),
      );
    } catch (error) {
      this.logger.error(
        `summary job eklenemedi: orgId=${orgId} projectId=${projectId} date=${date}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
