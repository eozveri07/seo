import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor } from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  GscSyncJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { GscSyncService } from './gsc-sync.service';

/** `gsc-sync`: günlük ve manuel sync (son 5 gün). İş mantığı `GscSyncService`'te. */
@Processor(QueueName.GscSync, {
  concurrency: QUEUE_DEFINITIONS[QueueName.GscSync].concurrency,
  limiter: QUEUE_DEFINITIONS[QueueName.GscSync].limiter,
})
export class GscSyncProcessor extends BaseProcessor<QueueName.GscSync> {
  protected readonly queueName = QueueName.GscSync;
  protected readonly logger = new Logger(GscSyncProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly gscSyncService: GscSyncService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<GscSyncJobData>): Promise<unknown> {
    return this.gscSyncService.syncRecent(job.data.projectId, job.data.date);
  }
}
