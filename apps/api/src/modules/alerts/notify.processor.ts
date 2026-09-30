import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor } from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  NotifyJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { MissingAlertEventIdError } from './alerts.errors';
import { NotifyService } from './notify.service';

/** `notify`: bir alert olayının tek bir kanala gönderilmesi. */
@Processor(QueueName.Notify, {
  concurrency: QUEUE_DEFINITIONS[QueueName.Notify].concurrency,
})
export class NotifyProcessor extends BaseProcessor<QueueName.Notify> {
  protected readonly queueName = QueueName.Notify;
  protected readonly logger = new Logger(NotifyProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly notifyService: NotifyService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<NotifyJobData>): Promise<unknown> {
    if (!job.data.alertEventId) {
      throw new MissingAlertEventIdError();
    }
    return this.notifyService.notify(job.data.channelId, job.data.alertEventId);
  }
}
