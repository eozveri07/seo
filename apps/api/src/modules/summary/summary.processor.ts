import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { todayUtc } from '../../common/dates/utc-date';
import { BaseProcessor } from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  QUEUE_DEFINITIONS,
  QueueName,
  SummaryJobData,
} from '../../infra/queue/queues';
import { SummaryService } from './summary.service';

/** `summary`: proje ve tarih bazlı özet. İş mantığı `SummaryService`'te. */
@Processor(QueueName.Summary, {
  concurrency: QUEUE_DEFINITIONS[QueueName.Summary].concurrency,
})
export class SummaryProcessor extends BaseProcessor<QueueName.Summary> {
  protected readonly queueName = QueueName.Summary;
  protected readonly logger = new Logger(SummaryProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly summaryService: SummaryService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<SummaryJobData>): Promise<unknown> {
    return this.summaryService.compute(
      job.data.orgId,
      job.data.projectId,
      job.data.date ?? todayUtc(),
    );
  }
}
