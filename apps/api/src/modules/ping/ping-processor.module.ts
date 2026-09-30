import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { PingProcessor } from './ping.processor';
import { PingSharedModule } from './ping-shared.module';

/**
 * Worker tarafı: `ping` kuyruğunu işleyen processor. T1.5'te silinecek.
 */
@Module({
  imports: [QueueModule, PingSharedModule],
  providers: [PingProcessor],
})
export class PingProcessorModule {}
