import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import {
  BaseProcessor,
  isFinalAttempt,
} from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  Ga4SyncJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { GA4_BACKFILL_JOB_NAME } from './ga4-jobs.service';
import { Ga4SyncService } from './ga4-sync.service';

/**
 * `ga4-sync`: günlük/manuel sync (son 3 gün) ve backfill (tek gün) aynı
 * kuyruğu paylaşır (ARCHITECTURE §7'de GA4 için ayrı bir backfill kuyruğu
 * yok); job adı (`GA4_BACKFILL_JOB_NAME`) hangisi olduğunu ayırt eder. İş
 * mantığı `Ga4SyncService`'te.
 */
@Processor(QueueName.Ga4Sync, {
  concurrency: QUEUE_DEFINITIONS[QueueName.Ga4Sync].concurrency,
  limiter: QUEUE_DEFINITIONS[QueueName.Ga4Sync].limiter,
})
export class Ga4SyncProcessor extends BaseProcessor<QueueName.Ga4Sync> {
  protected readonly queueName = QueueName.Ga4Sync;
  protected readonly logger = new Logger(Ga4SyncProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly ga4SyncService: Ga4SyncService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<Ga4SyncJobData>): Promise<unknown> {
    if (job.name === GA4_BACKFILL_JOB_NAME) {
      return this.ga4SyncService.syncBackfillDay(
        job.data.projectId,
        job.data.date,
        // Hata UnrecoverableError ise servis zaten son deneme sayar.
        isFinalAttempt(job, undefined),
      );
    }
    return this.ga4SyncService.syncRecent(job.data.projectId, job.data.date);
  }
}
