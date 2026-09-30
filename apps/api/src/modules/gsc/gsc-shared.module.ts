import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../../connectors/connectors.module';
import { QueueModule } from '../../infra/queue/queue.module';
import { ConnectionsModule } from '../connections/connections.module';
import { JobsModule } from '../jobs/jobs.module';
import { GscJobsService } from './gsc-jobs.service';
import { GscQueryService } from './gsc-query.service';
import { GscStore } from './gsc-store';
import { GscSyncService } from './gsc-sync.service';

/**
 * API (manuel tetikleme, backfill başlatma, sorgular) ve worker'ın
 * (processor'lar, dispatch) ortak kullandığı GSC servisleri. HTTP katmanı
 * içermez. `GscQueryService` burada export edilir: T1.10 `summary` job'u
 * `dayTotals`'ı buradan çağırır (CLAUDE.md kural 1: kendi tablosuna yalnız
 * bu modülün service'i üzerinden erişilir).
 */
@Module({
  imports: [QueueModule, ConnectorsModule, ConnectionsModule, JobsModule],
  providers: [GscStore, GscSyncService, GscJobsService, GscQueryService],
  exports: [GscSyncService, GscJobsService, GscQueryService],
})
export class GscSharedModule {}
