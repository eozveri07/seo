import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditService } from '../audit-logs/audit.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { ChannelSenderService } from './channel-sender.service';
import {
  NotificationChannel,
  NotificationChannelType,
} from './entities/notification-channel.entity';
import {
  NotificationChannelNotFoundError,
  NotificationChannelTestFailedError,
} from './alerts.errors';
import { InvalidAlertRuleConfigError } from './alerts.errors';
import { NotificationChannelsService } from './notification-channels.service';

function setup() {
  const channels = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn((entity: Partial<NotificationChannel>) =>
      Promise.resolve({ id: 'channel-1', ...entity }),
    ),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const crypto = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const channelSender = { send: jest.fn().mockResolvedValue(undefined) };

  const service = new NotificationChannelsService(
    channels as unknown as TenantRepository<NotificationChannel>,
    crypto as unknown as CryptoService,
    audit as unknown as AuditService,
    channelSender as unknown as ChannelSenderService,
  );

  return { service, channels, crypto, audit, channelSender };
}

describe('NotificationChannelsService', () => {
  it('create: discord config doğrulanır, şifrelenir ve audit kaydı yazılır', async () => {
    const { service, channels, crypto, audit } = setup();

    const channel = await service.create({
      type: NotificationChannelType.Discord,
      name: 'Ekip Discord',
      config: { webhookUrl: 'https://discord.example/hook' },
    });

    expect(crypto.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ webhookUrl: 'https://discord.example/hook' }),
    );
    expect(channels.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationChannelType.Discord,
        name: 'Ekip Discord',
      }),
    );
    expect(audit.record).toHaveBeenCalled();
    expect(channel.id).toBe('channel-1');
  });

  it('create: geçersiz webhook URL reddedilir', async () => {
    const { service } = setup();

    await expect(
      service.create({
        type: NotificationChannelType.Slack,
        name: 'Slack',
        config: { webhookUrl: 'http://not-https.example' },
      }),
    ).rejects.toThrow(InvalidAlertRuleConfigError);
  });

  it('findOne: bulunamazsa NotificationChannelNotFoundError fırlatır', async () => {
    const { service, channels } = setup();
    channels.findOneBy.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(
      NotificationChannelNotFoundError,
    );
  });

  it('test: kanal başarıyla gönderirse hata fırlatmaz', async () => {
    const { service, channels, channelSender } = setup();
    channels.findOneBy.mockResolvedValue({
      id: 'channel-1',
      type: NotificationChannelType.Email,
      name: 'E-posta',
      configEncrypted: 'enc:{"to":["a@example.com"]}',
    });

    await service.test('channel-1');

    expect(channelSender.send).toHaveBeenCalledWith(
      NotificationChannelType.Email,
      { to: ['a@example.com'] },
      expect.objectContaining({ subject: 'Test bildirimi' }),
    );
  });

  it('test: kanal gönderimi başarısız olursa NotificationChannelTestFailedError fırlatır', async () => {
    const { service, channels, channelSender } = setup();
    channels.findOneBy.mockResolvedValue({
      id: 'channel-1',
      type: NotificationChannelType.Email,
      name: 'E-posta',
      configEncrypted: 'enc:{"to":["a@example.com"]}',
    });
    channelSender.send.mockRejectedValue(new Error('SMTP kapalı'));

    await expect(service.test('channel-1')).rejects.toThrow(
      NotificationChannelTestFailedError,
    );
  });
});
