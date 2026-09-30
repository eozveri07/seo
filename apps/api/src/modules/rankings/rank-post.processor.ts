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
  RankPostJobData,
} from '../../infra/queue/queues';
import { RankPostService } from './rank-post.service';

/** `rank-post`: günün keyword'lerini Standard queue'ya gönderir. İş mantığı `RankPostService`'te. */
@Processor(QueueName.RankPost, {
  concurrency: QUEUE_DEFINITIONS[QueueName.RankPost].concurrency,
})
export class RankPostProcessor extends BaseProcessor<QueueName.RankPost> {
  protected readonly queueName = QueueName.RankPost;
  protected readonly logger = new Logger(RankPostProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly rankPostService: RankPostService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<RankPostJobData>): Promise<unknown> {
    const { orgId, projectId, date, scope, runId } = job.data;
    return this.rankPostService.post(orgId, projectId, date, scope, runId);
  }
}
