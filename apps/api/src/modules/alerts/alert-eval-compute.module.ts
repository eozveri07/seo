import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { ClientsModule } from '../clients/clients.module';
import { ConnectionsModule } from '../connections/connections.module';
import { JobsModule } from '../jobs/jobs.module';
import { KeywordsSharedModule } from '../keywords/keywords-shared.module';
import { RankingsSharedModule } from '../rankings/rankings-shared.module';
import { SummarySharedModule } from '../summary/summary-shared.module';
import { AlertEvalService } from './alert-eval.service';
import { AlertsSharedModule } from './alerts-shared.module';

/**
 * `alert-eval` job'unun hesap servisi (worker'a özgü). `SummaryComputeModule`
 * gibi `ClientsModule`'a bağımlı modülleri (Rankings/Keywords/Connections)
 * kullanır; bu yüzden yalnız worker'daki `AlertEvalProcessorModule` kullanır.
 */
@Module({
  imports: [
    QueueModule,
    AlertsSharedModule,
    RankingsSharedModule,
    KeywordsSharedModule,
    SummarySharedModule,
    ConnectionsModule,
    JobsModule,
    ClientsModule,
  ],
  providers: [AlertEvalService],
  exports: [AlertEvalService],
})
export class AlertEvalComputeModule {}
