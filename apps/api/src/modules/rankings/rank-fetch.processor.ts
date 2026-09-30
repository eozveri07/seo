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
  RankFetchJobData,
} from '../../infra/queue/queues';
import { RankFetchService } from './rank-fetch.service';

/**
 * `rank-fetch`: Standard queue task'ının sonucu (`kind: 'task'`) ya da anlık
 * kontrol (`kind: 'live'`). İş mantığı `RankFetchService`'te.
 */
@Processor(QueueName.RankFetch, {
  concurrency: QUEUE_DEFINITIONS[QueueName.RankFetch].concurrency,
  limiter: QUEUE_DEFINITIONS[QueueName.RankFetch].limiter,
})
export class RankFetchProcessor extends BaseProcessor<QueueName.RankFetch> {
  protected readonly queueName = QueueName.RankFetch;
  protected readonly logger = new Logger(RankFetchProcessor.name);

  constructor(
    cls: ClsService<AppClsStore>,
    @Inject(JOB_RUN_RECORDER) jobRunRecorder: JobRunRecorder,
    private readonly rankFetchService: RankFetchService,
  ) {
    super(cls, jobRunRecorder);
  }

  protected handle(job: Job<RankFetchJobData>): Promise<unknown> {
    const data = job.data;
    if (data.kind === 'live') {
      return this.rankFetchService.checkLive(
        data.orgId,
        data.projectId,
        data.trackedKeywordId,
        data.date,
        data.runId,
      );
    }
    return this.rankFetchService.fetchTask(
      data.orgId,
      data.projectId,
      data.rankTaskId,
      data.runId,
    );
  }
}
