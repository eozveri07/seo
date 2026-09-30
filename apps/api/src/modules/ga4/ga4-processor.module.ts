import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { Ga4SharedModule } from './ga4-shared.module';
import { Ga4SyncProcessor } from './ga4-sync.processor';

/** Worker: `ga4-sync` processor'ı (günlük, manuel ve backfill job'ları). */
@Module({
  imports: [Ga4SharedModule, JobsModule],
  providers: [Ga4SyncProcessor],
})
export class Ga4SyncProcessorModule {}
