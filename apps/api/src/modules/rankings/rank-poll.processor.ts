import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_DEFINITIONS,
  QueueName,
  RankPollJobData,
} from '../../infra/queue/queues';
import { RankPollService } from './rank-poll.service';

/**
 * `rank-poll`. DataForSEO `tasks_ready` hesap geneli olduğu için sistem
 * job'udur (`DispatchProcessor` gibi): `BaseProcessor`'dan türemez ve
 * `job_runs`'a yazılmaz; eklediği `rank-fetch` job'ları kendi org'larıyla
 * kaydedilir.
 */
@Processor(QueueName.RankPoll, {
  concurrency: QUEUE_DEFINITIONS[QueueName.RankPoll].concurrency,
})
export class RankPollProcessor extends WorkerHost {
  private readonly logger = new Logger(RankPollProcessor.name);

  constructor(private readonly rankPollService: RankPollService) {
    super();
  }

  async process(job: Job<RankPollJobData>): Promise<unknown> {
    this.logger.debug(`rank-poll: jobId=${job.id ?? 'unknown'}`);
    return this.rankPollService.poll();
  }
}
