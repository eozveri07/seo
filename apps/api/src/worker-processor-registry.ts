import { Type } from '@nestjs/common';
import { QueueName } from './infra/queue/queues';
import { DispatchProcessorModule } from './modules/dispatch/dispatch-processor.module';
import { Ga4SyncProcessorModule } from './modules/ga4/ga4-processor.module';
import {
  GscBackfillProcessorModule,
  GscSyncProcessorModule,
} from './modules/gsc/gsc-processor.module';

export interface WorkerProcessorRegistryEntry {
  queueName: QueueName;
  module: Type<unknown>;
}

/**
 * Her kuyruğun processor modülü burada kayıtlıdır. `WorkerModule.register()`
 * `WORKER_QUEUES` filtresine göre bu listeden hangi modüllerin yükleneceğini
 * seçer. Yeni bir processor eklendiğinde buraya bir satır eklenir.
 */
export const WORKER_PROCESSOR_REGISTRY: WorkerProcessorRegistryEntry[] = [
  { queueName: QueueName.Dispatch, module: DispatchProcessorModule },
  { queueName: QueueName.GscSync, module: GscSyncProcessorModule },
  { queueName: QueueName.GscBackfill, module: GscBackfillProcessorModule },
  { queueName: QueueName.Ga4Sync, module: Ga4SyncProcessorModule },
];
