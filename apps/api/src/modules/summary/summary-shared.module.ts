import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { SummaryJobsService } from './summary-jobs.service';
import { SummaryQueryService } from './summary-query.service';
import { SummaryStore } from './summary-store';

/**
 * Özet okuma/yazma ve job ekleme (`project_daily_summary`'nin kendi
 * verisi). `ClientsModule` (`GET /projects/summary`) dahil her modül
 * güvenle import edebilir: `GscSharedModule`/`Ga4SharedModule`/
 * `RankingsSharedModule`'a bağımlı değildir (onlar `ClientsModule`'a
 * bağımlı olduğu için döngüsel import oluşturur, bkz. `SummaryComputeModule`).
 */
@Module({
  imports: [QueueModule],
  providers: [SummaryStore, SummaryJobsService, SummaryQueryService],
  exports: [SummaryStore, SummaryJobsService, SummaryQueryService],
})
export class SummarySharedModule {}
