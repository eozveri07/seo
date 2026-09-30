import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppLogger } from './common/logger/app-logger.service';
import { WorkerModule } from './worker.module';

const API_ROOT = join(__dirname, '..');

/**
 * `data-source.ts`'teki ile aynı sıra: önce apps/api/.env, sonra repo
 * kökündeki .env. `WorkerModule.register()` `process.env.WORKER_QUEUES`'u
 * okuduğu için bu dosyalar, `register()` çağrılmadan önce yüklenir
 * (import'ların kendisi env'e bağlı değildir, sadece `register()` çağrısı).
 */
function loadEnvFiles(): void {
  for (const file of [
    join(API_ROOT, '.env'),
    join(API_ROOT, '..', '..', '.env'),
  ]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

async function bootstrap(): Promise<void> {
  loadEnvFiles();

  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(),
    { bufferLogs: true },
  );
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  // Nest'in enableShutdownHooks'u SIGTERM/SIGINT'te önce onModuleDestroy /
  // onApplicationShutdown yaşam döngüsünü çalıştırır (BullMQ worker'ları
  // aktif job'ları bitirip kapanır), sonra process'i sonlandırır.
  app.enableShutdownHooks();

  logger.log(
    `Worker başladı. WORKER_QUEUES=${process.env.WORKER_QUEUES || '(tümü)'}`,
  );
}

void bootstrap();
