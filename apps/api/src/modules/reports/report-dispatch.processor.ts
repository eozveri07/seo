import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_DEFINITIONS,
  QueueName,
  ReportDispatchJobData,
} from '../../infra/queue/queues';
import { ReportDispatchService } from './report-dispatch.service';

/**
 * `report-dispatch` kuyruğu. `dispatch` gibi tüm org'ları dolaşan bir sistem
 * job'u olduğu için `BaseProcessor`'dan türemez.
 */
@Processor(QueueName.ReportDispatch, {
  concurrency: QUEUE_DEFINITIONS[QueueName.ReportDispatch].concurrency,
})
export class ReportDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportDispatchProcessor.name);

  constructor(private readonly reportDispatch: ReportDispatchService) {
    super();
  }

  async process(job: Job<ReportDispatchJobData>): Promise<unknown> {
    this.logger.log(`report-dispatch başladı: jobId=${job.id ?? 'unknown'}`);
    return this.reportDispatch.dispatch();
  }
}
