import { CryptoService } from '../../infra/crypto/crypto.service';
import { AlertEventsStore } from './alert-events.store';
import { ChannelSenderService } from './channel-sender.service';
import { NotificationChannelType } from './entities/notification-channel.entity';
import { NotificationChannelsService } from './notification-channels.service';
import { NotifyService } from './notify.service';
import { AlertRuleType } from './entities/alert-rule.entity';

const EVENT = {
  id: 'event-1',
  payload: {
    alertType: AlertRuleType.RankDrop,
    projectName: 'Acme',
    keyword: 'seo ajansı',
    previousPosition: 3,
    position: 8,
    panelUrl: 'https://panel.example.com',
  },
};

function setup() {
  const channels = {
    findOne: jest.fn().mockResolvedValue({
      id: 'channel-1',
      type: NotificationChannelType.Discord,
      configEncrypted: 'encrypted',
    }),
  };
  const channelSender = { send: jest.fn().mockResolvedValue(undefined) };
  const eventsStore = {
    findById: jest.fn().mockResolvedValue(EVENT),
    markNotified: jest.fn().mockResolvedValue(undefined),
    markNotifyError: jest.fn().mockResolvedValue(undefined),
  };
  const crypto = {
    decrypt: jest
      .fn()
      .mockReturnValue(
        JSON.stringify({ webhookUrl: 'https://discord.example/hook' }),
      ),
  };

  const service = new NotifyService(
    channels as unknown as NotificationChannelsService,
    channelSender as unknown as ChannelSenderService,
    eventsStore as unknown as AlertEventsStore,
    crypto as unknown as CryptoService,
  );

  return { service, channels, channelSender, eventsStore, crypto };
}

describe('NotifyService.notify', () => {
  it('kanala mesaj gönderir ve olayı notified olarak işaretler', async () => {
    const { service, channelSender, eventsStore } = setup();

    await service.notify('channel-1', 'event-1');

    expect(channelSender.send).toHaveBeenCalledWith(
      NotificationChannelType.Discord,
      { webhookUrl: 'https://discord.example/hook' },
      expect.objectContaining({
        text: expect.stringContaining('seo ajansı') as string,
      }),
    );
    expect(eventsStore.markNotified).toHaveBeenCalledWith('event-1');
  });

  it('gönderim hatası notify_error a yazılır ve tekrar fırlatılır (BullMQ retry)', async () => {
    const { service, channelSender, eventsStore } = setup();
    channelSender.send.mockRejectedValue(new Error('webhook 500'));

    await expect(service.notify('channel-1', 'event-1')).rejects.toThrow(
      'webhook 500',
    );
    expect(eventsStore.markNotifyError).toHaveBeenCalledWith(
      'event-1',
      'webhook 500',
    );
  });

  it('olay bulunamazsa sessizce atlanır', async () => {
    const { service, eventsStore, channelSender } = setup();
    eventsStore.findById.mockResolvedValue(null);

    await service.notify('channel-1', 'missing');

    expect(channelSender.send).not.toHaveBeenCalled();
  });
});
