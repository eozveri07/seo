import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { MailModule } from './infra/mail/mail.module';
import { QueueModule } from './infra/queue/queue.module';
import { StorageModule } from './infra/storage/storage.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { Ga4Module } from './modules/ga4/ga4.module';
import { GscModule } from './modules/gsc/gsc.module';
import { HealthModule } from './modules/health/health.module';
import { KeywordsModule } from './modules/keywords/keywords.module';
import { LocationsModule } from './modules/locations/locations.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SummaryModule } from './modules/summary/summary.module';
import { UsageModule } from './modules/usage/usage.module';
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
    // Sıra önemli: global guard'lar JwtAuthGuard → TenantGuard → RolesGuard →
    // ProjectAccessGuard sırasıyla çalışır (app.module.spec.ts).
    AuthModule,
    OrganizationsModule,
    ClientsModule,
    ConnectionsModule,
    GscModule,
    Ga4Module,
    KeywordsModule,
    RankingsModule,
    SummaryModule,
    AlertsModule,
    ReportsModule,
    LocationsModule,
    UsageModule,
    HealthModule,
  ],
})
export class AppModule {}
