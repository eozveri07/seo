import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  QUEUE_DEFINITIONS,
  QueueName,
  RankPollJobData,
} from '../../infra/queue/queues';

/** ARCHITECTURE §8.1: `rank-poll` her 2 dakikada bir. */
export const RANK_POLL_SCHEDULER_ID = 'rank-poll';
export const RANK_POLL_EVERY_MS = 120_000;

/**
 * Worker açılışında `rank-poll` Job Scheduler'ını kaydeder
 * (`DispatchScheduler` gibi: idempotent, Redis'e ulaşılamazsa açılışı
 * bekletmez).
 */
@Injectable()
export class RankPollScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RankPollScheduler.name);

  constructor(
    @InjectQueue(QueueName.RankPoll)
    private readonly pollQueue: Queue<RankPollJobData>,
  ) {}

  onApplicationBootstrap(): void {
    void this.register().catch((error: unknown) => {
      this.logger.error(
        `${RANK_POLL_SCHEDULER_ID} kaydedilemedi`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async register(): Promise<void> {
    await this.pollQueue.upsertJobScheduler(
      RANK_POLL_SCHEDULER_ID,
      { every: RANK_POLL_EVERY_MS },
      {
        name: RANK_POLL_SCHEDULER_ID,
        data: {},
        opts: QUEUE_DEFINITIONS[QueueName.RankPoll].defaultJobOptions,
      },
    );
    this.logger.log(
      `${RANK_POLL_SCHEDULER_ID} kaydedildi (her ${RANK_POLL_EVERY_MS / 1000} sn)`,
    );
  }
}
