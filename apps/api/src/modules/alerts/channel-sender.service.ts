import { Injectable } from '@nestjs/common';
import { MailService } from '../../infra/mail/mail.service';
import { WebhookClient } from '../../infra/webhook/webhook.client';
import { NotificationChannelType } from './entities/notification-channel.entity';
import {
  EmailChannelConfig,
  NotificationChannelConfig,
  WebhookChannelConfig,
} from './notification-channel-config';

export interface AlertMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * Bildirim kanalına göre gönderim (ARCHITECTURE §11): e-posta `MailService`,
 * Discord/Slack webhook `WebhookClient` ile. `notify` job'u ve kanal test
 * butonu (`POST /notification-channels/:id/test`) bu servisi paylaşır.
 */
@Injectable()
export class ChannelSenderService {
  constructor(
    private readonly mail: MailService,
    private readonly webhook: WebhookClient,
  ) {}

  async send(
    type: NotificationChannelType,
    config: NotificationChannelConfig,
    message: AlertMessage,
  ): Promise<void> {
    switch (type) {
      case NotificationChannelType.Email:
        await this.mail.send({
          to: (config as EmailChannelConfig).to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        return;
      case NotificationChannelType.Discord:
        await this.webhook.post((config as WebhookChannelConfig).webhookUrl, {
          content: `**${message.subject}**\n${message.text}`,
        });
        return;
      case NotificationChannelType.Slack:
        await this.webhook.post((config as WebhookChannelConfig).webhookUrl, {
          text: `*${message.subject}*\n${message.text}`,
        });
        return;
    }
  }
}
