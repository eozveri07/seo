import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { provideTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { MailModule } from '../../infra/mail/mail.module';
import { WebhookModule } from '../../infra/webhook/webhook.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AlertEventsService } from './alert-events.service';
import { AlertEventsStore } from './alert-events.store';
import { AlertRulesService } from './alert-rules.service';
import { ChannelSenderService } from './channel-sender.service';
import { AlertEvent } from './entities/alert-event.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { NotificationChannel } from './entities/notification-channel.entity';
import { NotificationChannelsService } from './notification-channels.service';

/**
 * API (CRUD, geçmiş) ve worker'ın (`alert-eval`/`notify` processor'ları)
 * ortak kullandığı alert servisleri. HTTP katmanı içermez.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AlertRule, AlertEvent, NotificationChannel]),
    CryptoModule,
    MailModule,
    WebhookModule,
    AuditLogsModule,
  ],
  providers: [
    provideTenantRepository(AlertRule),
    provideTenantRepository(AlertEvent),
    provideTenantRepository(NotificationChannel),
    ChannelSenderService,
    NotificationChannelsService,
    AlertRulesService,
    AlertEventsService,
    AlertEventsStore,
  ],
  exports: [
    CryptoModule,
    ChannelSenderService,
    NotificationChannelsService,
    AlertRulesService,
    AlertEventsService,
    AlertEventsStore,
  ],
})
export class AlertsSharedModule {}
