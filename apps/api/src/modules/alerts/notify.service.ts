import { Injectable, Logger } from '@nestjs/common';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { buildAlertMessage } from './alert-message';
import { AlertEventsStore } from './alert-events.store';
import { ChannelSenderService } from './channel-sender.service';
import { NotificationChannelConfig } from './notification-channel-config';
import { NotificationChannelsService } from './notification-channels.service';

/**
 * `notify` job'u (ARCHITECTURE §11): `alert-eval`'in ürettiği olayı,
 * kuralın seçtiği kanala gönderir. Kanal hatası `alert_events.notify_error`'a
 * yazılır ve hatayı yeniden fırlatır; BullMQ §7'deki retry'ı (5 deneme,
 * exponential backoff) uygular. Olay silinmişse (ör. kural silindi) sessizce
 * atlanır.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly channels: NotificationChannelsService,
    private readonly channelSender: ChannelSenderService,
    private readonly eventsStore: AlertEventsStore,
    private readonly crypto: CryptoService,
  ) {}

  async notify(channelId: string, alertEventId: string): Promise<void> {
    const event = await this.eventsStore.findById(alertEventId);
    if (!event) {
      this.logger.warn(`alert_event bulunamadı, atlandı: ${alertEventId}`);
      return;
    }

    const channel = await this.channels.findOne(channelId);
    const config = JSON.parse(
      this.crypto.decrypt(channel.configEncrypted),
    ) as NotificationChannelConfig;
    const message = buildAlertMessage(event.payload);

    try {
      await this.channelSender.send(channel.type, config, message);
      await this.eventsStore.markNotified(event.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.eventsStore.markNotifyError(event.id, reason);
      throw error;
    }
  }
}
