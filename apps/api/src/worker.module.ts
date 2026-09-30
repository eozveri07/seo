import { DynamicModule, Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { MailModule } from './infra/mail/mail.module';
import { QueueModule } from './infra/queue/queue.module';
import { QueueName } from './infra/queue/queues';
import { StorageModule } from './infra/storage/storage.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { WORKER_PROCESSOR_REGISTRY } from './worker-processor-registry';

/**
 * Worker entrypoint'inin (`src/worker.ts`) yüklediği modül. HTTP katmanı
 * içermez, `createApplicationContext` ile ayağa kalkar.
 *
 * `WORKER_QUEUES` (virgülle ayrılmış kuyruk isimleri) boşsa tüm processor
 * modülleri kayıt olur; doluysa yalnız listelenen kuyrukların processor'ları
 * yüklenir.
 *
 * `HousekeepingModule` (ARCHITECTURE §8.2) sadece `SCHEDULER_ENABLED=true`
 * iken yüklenir; `AppModule` bu modülü hiç import etmez.
 */
@Module({})
export class WorkerModule {
  static register(): DynamicModule {
    const enabledQueues = parseWorkerQueues(process.env.WORKER_QUEUES);
    const processorModules = WORKER_PROCESSOR_REGISTRY.filter(
      (entry) => !enabledQueues || enabledQueues.includes(entry.queueName),
    ).map((entry) => entry.module);
    const schedulerEnabled = process.env.SCHEDULER_ENABLED === 'true';

    return {
      module: WorkerModule,
      imports: [
        ConfigModule,
        CommonModule,
        DatabaseModule,
        QueueModule,
        CryptoModule,
        MailModule,
        StorageModule,
        ...(schedulerEnabled ? [HousekeepingModule.register()] : []),
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
