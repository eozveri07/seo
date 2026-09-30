import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../../connectors/connectors.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { ConnectionsModule } from '../connections/connections.module';
import { JobsModule } from '../jobs/jobs.module';
import { Ga4JobsService } from './ga4-jobs.service';
import { Ga4Store } from './ga4-store';
import { Ga4SyncService } from './ga4-sync.service';

/**
 * API (manuel tetikleme, backfill başlatma) ve worker'ın (processor,
 * dispatch) ortak kullandığı GA4 servisleri. HTTP katmanı içermez.
 * T1.5'teki `GscSharedModule` kalıbı.
 */
@Module({
  imports: [QueueModule, ConnectorsModule, ConnectionsModule, JobsModule],
  providers: [Ga4Store, Ga4SyncService, Ga4JobsService],
  exports: [Ga4SyncService, Ga4JobsService],
})
export class Ga4SharedModule {}
