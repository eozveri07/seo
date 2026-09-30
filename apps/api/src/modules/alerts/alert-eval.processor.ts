import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor } from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  AlertEvalJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { AlertEvalService } from './alert-eval.service';

/** `alert-eval`: proje kurallarının değerlendirilmesi. İş mantığı `AlertEvalService`'te. */
@Processor(QueueName.AlertEval, {
  concurrency: QUEUE_DEFINITIONS[QueueName.AlertEval].concurrency,
})
export class AlertEvalProcessor extends BaseProcessor<QueueName.AlertEval> {
  protected readonly queueName = QueueName.AlertEval;
  protected readonly logger = new Logger(AlertEvalProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly alertEvalService: AlertEvalService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<AlertEvalJobData>): Promise<unknown> {
    return this.alertEvalService.evaluate(job.data.orgId, job.data.projectId);
  }
}
