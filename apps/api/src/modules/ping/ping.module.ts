import { Module } from '@nestjs/common';
import { QueueModule } from '../../infra/queue/queue.module';
import { PingController } from './ping.controller';

/**
 * API tarafı: `ping` kuyruğuna dev'de job ekleyen endpoint. T1.5'te silinecek.
 */
@Module({
  imports: [QueueModule],
  controllers: [PingController],
})
export class PingModule {}
