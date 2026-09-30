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
  QueueName,
  ReportJobData,
} from '../../infra/queue/queues';
import { ReportRendererService } from './report-renderer.service';

/** `report`: bir `reports` satırı için PDF üretimi (ARCHITECTURE §12). */
@Processor(QueueName.Report, {
  concurrency: QUEUE_DEFINITIONS[QueueName.Report].concurrency,
})
export class ReportProcessor extends BaseProcessor<QueueName.Report> {
  protected readonly queueName = QueueName.Report;
  protected readonly logger = new Logger(ReportProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly renderer: ReportRendererService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<ReportJobData>): Promise<unknown> {
    return this.renderer.render(job.data.reportId);
  }
}
