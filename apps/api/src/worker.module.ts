import { DynamicModule, Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './infra/queue/queue.module';
import { QueueName } from './infra/queue/queues';
import { WORKER_PROCESSOR_REGISTRY } from './worker-processor-registry';

/**
 * Worker entrypoint'inin (`src/worker.ts`) yüklediği modül. HTTP katmanı
 * içermez, `createApplicationContext` ile ayağa kalkar.
 *
 * `WORKER_QUEUES` (virgülle ayrılmış kuyruk isimleri) boşsa tüm processor
 * modülleri kayıt olur; doluysa yalnız listelenen kuyrukların processor'ları
 * yüklenir.
 */
@Module({})
export class WorkerModule {
  static register(): DynamicModule {
    const enabledQueues = parseWorkerQueues(process.env.WORKER_QUEUES);
    const processorModules = WORKER_PROCESSOR_REGISTRY.filter(
      (entry) => !enabledQueues || enabledQueues.includes(entry.queueName),
    ).map((entry) => entry.module);

    return {
      module: WorkerModule,
      imports: [
        ConfigModule,
        CommonModule,
        DatabaseModule,
        QueueModule,
        ...processorModules,
      ],
    };
  }
}

export function parseWorkerQueues(
  raw: string | undefined,
): QueueName[] | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0) as QueueName[];
}
