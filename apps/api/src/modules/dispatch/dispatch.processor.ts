import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { todayUtc } from '../../common/dates/utc-date';
import {
  DispatchJobData,
  QUEUE_DEFINITIONS,
  QueueName,
} from '../../infra/queue/queues';
import { WEEKLY_DISPATCH_SCHEDULER_ID } from './dispatch-scheduler';
import { DispatchService } from './dispatch.service';

/**
 * `dispatch` kuyruğu. Tüm org'ları dolaşan bir sistem job'u olduğu için
 * `BaseProcessor`'dan türemez: tek bir tenant'ı yoktur ve `job_runs`'a
 * (org_id zorunlu) yazılmaz. Eklediği her proje job'u kendi org'uyla
 * kaydedilir.
 */
@Processor(QueueName.Dispatch, {
  concurrency: QUEUE_DEFINITIONS[QueueName.Dispatch].concurrency,
})
export class DispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchProcessor.name);

  constructor(private readonly dispatchService: DispatchService) {
    super();
  }

  async process(job: Job<DispatchJobData>): Promise<unknown> {
    // Scheduler şablonu sabit; gün, job'un işlendiği andaki UTC gündür.
    const date = job.data?.date ?? todayUtc();
    this.logger.log(
      `dispatch başladı: name=${job.name} jobId=${job.id ?? 'unknown'} date=${date}`,
    );
    if (job.name === WEEKLY_DISPATCH_SCHEDULER_ID) {
      return this.dispatchService.dispatchWeekly(date);
    }
    return this.dispatchService.dispatchDaily(date);
  }
}
