import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { ReportDispatchProcessor } from './report-dispatch.processor';
import { ReportDispatchScheduler } from './report-dispatch-scheduler';
import { ReportDispatchService } from './report-dispatch.service';
import { ReportsSharedModule } from './reports-shared.module';

/**
 * Worker: `report-dispatch` kuyruğu ve saatlik Job Scheduler'ı
 * (ARCHITECTURE §12). `dispatch` gibi tek bir tenant'ı olmayan sistem
 * job'udur.
 */
@Module({
  imports: [QueueModule, ReportsSharedModule],
  providers: [
    ReportDispatchService,
    ReportDispatchProcessor,
    ReportDispatchScheduler,
  ],
})
export class ReportDispatchProcessorModule {}
