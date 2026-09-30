import { Module } from '@nestjs/common';
import { PingService } from './ping.service';

/**
 * `PingService`'i API'nin (controller) ve worker'ın (processor) ortak
 * kullanması için ayrı modül. Böylece worker, API controller'ını yüklemez.
 */
@Module({
  providers: [PingService],
  exports: [PingService],
})
export class PingSharedModule {}
