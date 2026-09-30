import { NotificationChannelType } from './entities/notification-channel.entity';
import {
  maskNotificationChannelConfig,
  validateNotificationChannelConfig,
} from './notification-channel-config';
import { InvalidAlertRuleConfigError } from './alerts.errors';

describe('validateNotificationChannelConfig', () => {
  it('email: geçerli adres listesini kabul eder', () => {
    expect(
      validateNotificationChannelConfig(NotificationChannelType.Email, {
        to: ['a@example.com', 'b@example.com'],
      }),
    ).toEqual({ to: ['a@example.com', 'b@example.com'] });
  });

  it('email: boş liste ya da geçersiz adres reddedilir', () => {
    expect(() =>
      validateNotificationChannelConfig(NotificationChannelType.Email, {
        to: [],
      }),
    ).toThrow(InvalidAlertRuleConfigError);
    expect(() =>
      validateNotificationChannelConfig(NotificationChannelType.Email, {
        to: ['not-an-email'],
      }),
    ).toThrow(InvalidAlertRuleConfigError);
  });

  it('discord/slack: https webhook kabul edilir, http reddedilir', () => {
    expect(
      validateNotificationChannelConfig(NotificationChannelType.Discord, {
        webhookUrl: 'https://discord.example/hook',
      }),
    ).toEqual({ webhookUrl: 'https://discord.example/hook' });
    expect(() =>
      validateNotificationChannelConfig(NotificationChannelType.Slack, {
        webhookUrl: 'http://insecure.example/hook',
      }),
    ).toThrow(InvalidAlertRuleConfigError);
  });
});

describe('maskNotificationChannelConfig', () => {
  it('email adreslerini maskeler', () => {
    expect(
      maskNotificationChannelConfig(NotificationChannelType.Email, {
        to: ['alice@example.com'],
      }),
    ).toEqual({ to: ['a***@example.com'] });
  });

  it('webhook URLsini path olmadan maskeler', () => {
    expect(
      maskNotificationChannelConfig(NotificationChannelType.Discord, {
        webhookUrl: 'https://discord.com/api/webhooks/123/secret-token',
      }),
    ).toEqual({ webhookUrl: 'https://discord.com/***' });
  });
});
