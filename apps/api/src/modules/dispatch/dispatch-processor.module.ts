import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { Ga4JobsService } from '../ga4/ga4-jobs.service';
import { Ga4SharedModule } from '../ga4/ga4-shared.module';
import { GscJobsService } from '../gsc/gsc-jobs.service';
import { GscSharedModule } from '../gsc/gsc-shared.module';
import { KeywordVolumeJobsService } from '../keywords/keyword-volume-jobs.service';
import { KeywordsSharedModule } from '../keywords/keywords-shared.module';
import {
  DAILY_DISPATCH_SOURCES,
  DailyDispatchSource,
} from './daily-dispatch-source';
import { DispatchScheduler } from './dispatch-scheduler';
import { DispatchService } from './dispatch.service';
import { DispatchProcessor } from './dispatch.processor';

/**
 * Worker: `dispatch` kuyruğu ve `daily-dispatch` Job Scheduler'ı
 * (ARCHITECTURE §8.1). Yeni bir veri kaynağı (rank) kendi shared modülünü
 * buraya import edip servisini `DAILY_DISPATCH_SOURCES`'a ekler.
 */
@Module({
  imports: [
    QueueModule,
    GscSharedModule,
    Ga4SharedModule,
    KeywordsSharedModule,
  ],
  providers: [
    {
      provide: DAILY_DISPATCH_SOURCES,
      inject: [GscJobsService, Ga4JobsService, KeywordVolumeJobsService],
      useFactory: (...sources: DailyDispatchSource[]) => sources,
    },
    DispatchService,
    DispatchProcessor,
    DispatchScheduler,
  ],
})
export class DispatchProcessorModule {}
