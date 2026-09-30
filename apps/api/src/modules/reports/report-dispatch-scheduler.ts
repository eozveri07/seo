import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  QUEUE_DEFINITIONS,
  QueueName,
  ReportDispatchJobData,
} from '../../infra/queue/queues';

/** ARCHITECTURE §12: `report-dispatch` her saat başı çalışır. */
export const REPORT_DISPATCH_SCHEDULER_ID = 'report-dispatch';
export const REPORT_DISPATCH_PATTERN = '0 * * * *';

/**
 * Worker açılışında `report-dispatch` Job Scheduler'ını kaydeder
 * (`upsertJobScheduler` idempotent, bkz. `DispatchScheduler`).
 */
@Injectable()
export class ReportDispatchScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportDispatchScheduler.name);

  constructor(
    @InjectQueue(QueueName.ReportDispatch)
    private readonly queue: Queue<ReportDispatchJobData>,
  ) {}

  onApplicationBootstrap(): void {
    void this.register().catch((error: unknown) => {
      this.logger.error(
        'report-dispatch scheduler kaydedilemedi',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async register(): Promise<void> {
    await this.queue.upsertJobScheduler(
      REPORT_DISPATCH_SCHEDULER_ID,
      { pattern: REPORT_DISPATCH_PATTERN, tz: 'UTC' },
      {
        name: REPORT_DISPATCH_SCHEDULER_ID,
        data: {},
        opts: QUEUE_DEFINITIONS[QueueName.ReportDispatch].defaultJobOptions,
      },
    );
    this.logger.log(
      `${REPORT_DISPATCH_SCHEDULER_ID} kaydedildi (${REPORT_DISPATCH_PATTERN} UTC)`,
    );
  }
}
