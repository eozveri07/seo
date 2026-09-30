import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { Ga4SharedModule } from '../ga4/ga4-shared.module';
import { GscSharedModule } from '../gsc/gsc-shared.module';
import { RankingsSharedModule } from '../rankings/rankings-shared.module';
import { SummarySharedModule } from './summary-shared.module';
import { SummaryService } from './summary.service';

/**
 * `summary` job'unun hesap servisi: worker'a özgü, `GscQueryService`/
 * `Ga4QueryService`/`RankSummaryService`'e bağımlı (CLAUDE.md kural 1,
 * ilgili modüllerin export ettiği servisler üzerinden). Bu modül `ClientsModule`
 * tarafından import edilmez: `RankingsSharedModule` zaten `ClientsModule`'a
 * bağımlı, tersi döngüsel import yaratır. Yalnız worker'daki
 * `SummaryProcessorModule` kullanır.
 */
@Module({
  imports: [
    QueueModule,
    SummarySharedModule,
    GscSharedModule,
    Ga4SharedModule,
    RankingsSharedModule,
  ],
  providers: [SummaryService],
  exports: [SummaryService],
})
export class SummaryComputeModule {}
