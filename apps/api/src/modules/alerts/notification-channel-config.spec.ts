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

describe('validateNotificationChannelConfig (SSRF)', () => {
  it.each([
    'https://localhost/hook',
    'https://api.localhost/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://172.16.0.1/hook',
    'https://192.168.1.1/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://100.64.0.1/hook',
    'https://0.0.0.0/hook',
    'https://[::1]/hook',
    'https://[fd00::1]/hook',
    'https://[fe80::1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://2130706433/hook',
  ])('dahili host %s reddedilir', (webhookUrl) => {
    expect(() =>
      validateNotificationChannelConfig(NotificationChannelType.Slack, {
        webhookUrl,
      }),
    ).toThrow(InvalidAlertRuleConfigError);
  });

  it.each([
    'https://discord.com/api/webhooks/123/token',
    'https://hooks.slack.com/services/T000/B000/XXXX',
  ])('public URL %s kabul edilir', (webhookUrl) => {
    expect(
      validateNotificationChannelConfig(NotificationChannelType.Discord, {
        webhookUrl,
      }),
    ).toEqual({ webhookUrl });
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
