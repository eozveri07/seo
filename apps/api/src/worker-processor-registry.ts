import { Type } from '@nestjs/common';
import { PingProcessorModule } from './modules/ping/ping-processor.module';
import { QueueName } from './infra/queue/queues';

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
  { queueName: QueueName.Ping, module: PingProcessorModule },
];
