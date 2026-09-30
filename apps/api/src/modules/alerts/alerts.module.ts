import { Module } from '@nestjs/common';
import { AlertEventsController } from './alert-events.controller';
import { AlertRulesController } from './alert-rules.controller';
import { AlertsSharedModule } from './alerts-shared.module';
import { NotificationChannelsController } from './notification-channels.controller';

/** API: alert kuralı CRUD'u, geçmiş ve bildirim kanalı CRUD'u + test. */
@Module({
  imports: [AlertsSharedModule],
  controllers: [
    AlertRulesController,
    AlertEventsController,
    NotificationChannelsController,
  ],
})
export class AlertsModule {}
