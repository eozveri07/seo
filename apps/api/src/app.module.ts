import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './infra/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { PingModule } from './modules/ping/ping.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    DatabaseModule,
    QueueModule,
    HealthModule,
    PingModule,
  ],
})
export class AppModule {}
