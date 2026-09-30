import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../../connectors/connectors.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { ConnectionsModule } from '../connections/connections.module';
import { JobsModule } from '../jobs/jobs.module';
import { GscJobsService } from './gsc-jobs.service';
import { GscStore } from './gsc-store';
import { GscSyncService } from './gsc-sync.service';

/**
 * API (manuel tetikleme, backfill başlatma) ve worker'ın (processor'lar,
 * dispatch) ortak kullandığı GSC servisleri. HTTP katmanı içermez.
 */
@Module({
  imports: [QueueModule, ConnectorsModule, ConnectionsModule, JobsModule],
  providers: [GscStore, GscSyncService, GscJobsService],
  exports: [GscSyncService, GscJobsService],
})
export class GscSharedModule {}
