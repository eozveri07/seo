import { Module } from '@nestjs/common';
import { DatabasePingService } from '../../infra/database-ping/database-ping.service';
import { RedisPingService } from '../../infra/redis/redis-ping.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, DatabasePingService, RedisPingService],
})
export class HealthModule {}
