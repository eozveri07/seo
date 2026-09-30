import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { MailModule } from './infra/mail/mail.module';
import { QueueModule } from './infra/queue/queue.module';
import { StorageModule } from './infra/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PingModule } from './modules/ping/ping.module';
import { UsersModule } from './modules/users/users.module';

/**
 * API process'i. `HousekeepingModule` (ARCHITECTURE §8.2) burada asla
 * import edilmez; sadece `WorkerModule` `SCHEDULER_ENABLED=true` iken yükler.
 */
@Module({
  imports: [
    ConfigModule,
    CommonModule,
    DatabaseModule,
    QueueModule,
    CryptoModule,
    MailModule,
    StorageModule,
    UsersModule,
    AuthModule,
    HealthModule,
    PingModule,
  ],
})
export class AppModule {}
