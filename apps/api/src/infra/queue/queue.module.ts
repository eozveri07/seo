import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueOptions } from 'bullmq';
import { EnvironmentVariables } from '../../config/environment-variables';
import { JOB_RUN_RECORDER } from './job-run-recorder';
import { LoggingJobRunRecorder } from './logging-job-run-recorder';
import { ALL_QUEUE_NAMES, QUEUE_DEFINITIONS } from './queues';

function buildQueueOptions(
  config: ConfigService<EnvironmentVariables, true>,
): QueueOptions {
  const url: string = config.get('REDIS_URL', { infer: true });
  return {
    connection: {
      url,
      // BullMQ'nun bloklayan komutları (BRPOPLPUSH vb.) için zorunlu.
      maxRetriesPerRequest: null,
    },
  };
}

/**
 * BullMQ root bağlantısı ve §7'deki tüm kuyrukların kaydı. API process'i
 * (job ekler) ve worker process'i (job işler) bu modülü aynı şekilde import
 * eder; hangi processor'ların çalışacağı `WorkerModule`'de belirlenir.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildQueueOptions,
    }),
    BullModule.registerQueue(
      ...ALL_QUEUE_NAMES.map((name) => ({
        name,
        defaultJobOptions: QUEUE_DEFINITIONS[name].defaultJobOptions,
      })),
    ),
  ],
  providers: [{ provide: JOB_RUN_RECORDER, useClass: LoggingJobRunRecorder }],
  exports: [BullModule, JOB_RUN_RECORDER],
})
export class QueueModule {}
