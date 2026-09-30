import { Processor } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { BaseProcessor } from '../../infra/queue/base.processor';
import { JOB_RUN_RECORDER } from '../../infra/queue/job-run-recorder';
import type { JobRunRecorder } from '../../infra/queue/job-run-recorder';
import {
  KeywordVolumeJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { KeywordVolumeService } from './keyword-volume.service';

/** `keyword-volume`: hacim/CPC güncelleme. İş mantığı `KeywordVolumeService`'te. */
@Processor(QueueName.KeywordVolume, {
  concurrency: QUEUE_DEFINITIONS[QueueName.KeywordVolume].concurrency,
  limiter: QUEUE_DEFINITIONS[QueueName.KeywordVolume].limiter,
})
export class KeywordVolumeProcessor extends BaseProcessor<QueueName.KeywordVolume> {
  protected readonly queueName = QueueName.KeywordVolume;
  protected readonly logger = new Logger(KeywordVolumeProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly keywordVolumeService: KeywordVolumeService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<KeywordVolumeJobData>): Promise<unknown> {
    return this.keywordVolumeService.refreshProject(
      job.data.orgId,
      job.data.projectId,
      job.data.runId,
    );
  }
}
