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
  GscBackfillJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { GscSyncService } from './gsc-sync.service';

/** `gsc-backfill`: tek gün, düşük öncelik. İş mantığı `GscSyncService`'te. */
@Processor(QueueName.GscBackfill, {
  concurrency: QUEUE_DEFINITIONS[QueueName.GscBackfill].concurrency,
  limiter: QUEUE_DEFINITIONS[QueueName.GscBackfill].limiter,
})
export class GscBackfillProcessor extends BaseProcessor<QueueName.GscBackfill> {
  protected readonly queueName = QueueName.GscBackfill;
  protected readonly logger = new Logger(GscBackfillProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly gscSyncService: GscSyncService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<GscBackfillJobData>): Promise<unknown> {
    return this.gscSyncService.syncBackfillDay(
      job.data.projectId,
      job.data.date,
      // Hata UnrecoverableError ise servis zaten son deneme sayar.
      isFinalAttempt(job, undefined),
    );
  }
}
