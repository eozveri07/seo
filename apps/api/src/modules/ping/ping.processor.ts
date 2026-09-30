import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor } from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  QUEUE_DEFINITIONS,
  PingJobData,
  QueueName,
} from '../../infra/queue/queues';
import { PingService } from './ping.service';

/** Örnek processor (T1.5'te silinecek). */
@Processor(QueueName.Ping, {
  concurrency: QUEUE_DEFINITIONS[QueueName.Ping].concurrency,
})
export class PingProcessor extends BaseProcessor<QueueName.Ping> {
  protected readonly queueName = QueueName.Ping;
  protected readonly logger = new Logger(PingProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly pingService: PingService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<PingJobData>): Promise<unknown> {
    return this.pingService.execute(job.data);
  }
}
