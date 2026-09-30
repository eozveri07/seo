import { Module } from '@nestjs/common';
import { SummaryComputeModule } from './summary-compute.module';
import { SummarySharedModule } from './summary-shared.module';
import { SummaryProcessor } from './summary.processor';
import { SummaryTriggerListener } from './summary-trigger.listener';

/**
 * Worker: `summary` processor'ı ve tetikleme listener'ı
 * (`sync.completed`/`rank.day_completed`). Listener burada yaşar: bu
 * event'ler yalnızca gsc-sync/ga4-sync/rank-fetch processor'ları
 * çalışırken worker sürecinde yayılır; `summary` kuyruğu işlenmiyorsa bile
 * job'un kuyruğa eklenmesi gerekir.
 */
@Module({
  imports: [SummarySharedModule, SummaryComputeModule],
  providers: [SummaryProcessor, SummaryTriggerListener],
})
export class SummaryProcessorModule {}
