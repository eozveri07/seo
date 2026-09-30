import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { GscBackfillProcessor } from './gsc-backfill.processor';
import { GscSharedModule } from './gsc-shared.module';
import { GscSyncProcessor } from './gsc-sync.processor';

/** Worker: `gsc-sync` processor'ı. */
@Module({
  imports: [GscSharedModule, JobsModule],
  providers: [GscSyncProcessor],
})
export class GscSyncProcessorModule {}

/** Worker: `gsc-backfill` processor'ı. */
@Module({
  imports: [GscSharedModule, JobsModule],
  providers: [GscBackfillProcessor],
})
export class GscBackfillProcessorModule {}
