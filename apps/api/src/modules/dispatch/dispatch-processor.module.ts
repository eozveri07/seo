import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { GscJobsService } from '../gsc/gsc-jobs.service';
import { GscSharedModule } from '../gsc/gsc-shared.module';
import {
  DAILY_DISPATCH_SOURCES,
  DailyDispatchSource,
} from './daily-dispatch-source';
import { DispatchScheduler } from './dispatch-scheduler';
import { DispatchService } from './dispatch.service';
import { DispatchProcessor } from './dispatch.processor';

/**
 * Worker: `dispatch` kuyruğu ve `daily-dispatch` Job Scheduler'ı
 * (ARCHITECTURE §8.1). Yeni bir veri kaynağı (GA4, rank) kendi shared
 * modülünü buraya import edip servisini `DAILY_DISPATCH_SOURCES`'a ekler.
 */
@Module({
  imports: [QueueModule, GscSharedModule],
  providers: [
    {
      provide: DAILY_DISPATCH_SOURCES,
      inject: [GscJobsService],
      useFactory: (...sources: DailyDispatchSource[]) => sources,
    },
    DispatchService,
    DispatchProcessor,
    DispatchScheduler,
  ],
})
export class DispatchProcessorModule {}
