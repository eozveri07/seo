import { NotificationChannelType } from './entities/notification-channel.entity';
import { InvalidAlertRuleConfigError } from './alerts.errors';
import { isBlockedWebhookHostname } from '../../infra/webhook/webhook-address-guard';

export interface EmailChannelConfig {
  to: string[];
}

export interface WebhookChannelConfig {
  webhookUrl: string;
}

export type NotificationChannelConfig =
  EmailChannelConfig | WebhookChannelConfig;

/**
 * `notification_channels.config_encrypted`'in şifresi çözülmüş şekli
 * (ARCHITECTURE §5.7). `email`: `{ to: string[] }`; `discord`/`slack`
 * (webhook): `{ webhookUrl: string }`. Webhook URL'leri de secret sayılır.
 */
export function validateNotificationChannelConfig(
  type: NotificationChannelType,
  config: unknown,
): NotificationChannelConfig {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new InvalidAlertRuleConfigError('config bir obje olmalı.');
  }
  const value = config as Record<string, unknown>;

  if (type === NotificationChannelType.Email) {
    const to = value.to;
    if (
      !Array.isArray(to) ||
      to.length === 0 ||
      !to.every((item) => typeof item === 'string' && item.includes('@'))
    ) {
      throw new InvalidAlertRuleConfigError(
        'email: config.to en az bir e-posta adresi içermeli.',
      );
    }
    return { to: to as string[] };
  }

  const webhookUrl = value.webhookUrl;
  if (typeof webhookUrl !== 'string' || !webhookUrl.startsWith('https://')) {
    throw new InvalidAlertRuleConfigError(
      'config.webhookUrl https:// ile başlayan bir URL olmalı.',
    );
  }
  let hostname: string;
  try {
    hostname = new URL(webhookUrl).hostname;
  } catch {
    throw new InvalidAlertRuleConfigError(
      'config.webhookUrl geçerli bir URL olmalı.',
    );
  }
  if (isBlockedWebhookHostname(hostname)) {
    throw new InvalidAlertRuleConfigError(
      'config.webhookUrl dahili ya da özel bir adrese işaret edemez.',
    );
  }
  return { webhookUrl };
}

/**
 * Panelde gösterilecek maskelenmiş özet: gerçek adres/URL asla response'a
 * konmaz (CLAUDE.md kural 9).
 */
export function maskNotificationChannelConfig(
  type: NotificationChannelType,
  config: NotificationChannelConfig,
): Record<string, unknown> {
  if (type === NotificationChannelType.Email) {
    const { to } = config as EmailChannelConfig;
    return { to: to.map(maskEmail) };
  }
  const { webhookUrl } = config as WebhookChannelConfig;
  return { webhookUrl: maskUrl(webhookUrl) };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visible = user.slice(0, 1);
  return `${visible}***@${domain}`;
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/***`;
  } catch {
    return '***';
  }
}
