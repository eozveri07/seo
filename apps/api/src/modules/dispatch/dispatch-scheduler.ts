import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  DispatchJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';

/** ARCHITECTURE §8.1 Job Scheduler tablosu (yalnız bu görevde gelen satır). */
export const DAILY_DISPATCH_SCHEDULER_ID = 'daily-dispatch';
export const DAILY_DISPATCH_PATTERN = '0 4 * * *';

/**
 * Worker açılışında `daily-dispatch` Job Scheduler'ını kaydeder
 * (`upsertJobScheduler` idempotent: birden fazla worker aynı id'yi yazar,
 * iş yine günde bir kez oluşur). Redis'e ulaşılamazsa worker'ın açılışını
 * bekletmemek için kayıt arka planda yapılır ve hata loglanır.
 */
@Injectable()
export class DispatchScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DispatchScheduler.name);

  constructor(
    @InjectQueue(QueueName.Dispatch)
    private readonly dispatchQueue: Queue<DispatchJobData>,
  ) {}

  onApplicationBootstrap(): void {
    void this.register().catch((error: unknown) => {
      this.logger.error(
        `${DAILY_DISPATCH_SCHEDULER_ID} kaydedilemedi`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async register(): Promise<void> {
    await this.dispatchQueue.upsertJobScheduler(
      DAILY_DISPATCH_SCHEDULER_ID,
      { pattern: DAILY_DISPATCH_PATTERN, tz: 'UTC' },
      {
        name: DAILY_DISPATCH_SCHEDULER_ID,
        data: {},
        // §7: 3 deneme, exponential. Scheduler'ın ürettiği job'lar kuyruk
        // varsayılanlarına güvenmesin diye açıkça verilir.
        opts: QUEUE_DEFINITIONS[QueueName.Dispatch].defaultJobOptions,
      },
    );
    this.logger.log(
      `${DAILY_DISPATCH_SCHEDULER_ID} kaydedildi (${DAILY_DISPATCH_PATTERN} UTC)`,
    );
  }
}
