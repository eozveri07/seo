import { MailService } from '../../infra/mail/mail.service';
import { WebhookClient } from '../../infra/webhook/webhook.client';
import { ChannelSenderService } from './channel-sender.service';
import { NotificationChannelType } from './entities/notification-channel.entity';

function setup() {
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const webhook = { post: jest.fn().mockResolvedValue(undefined) };
  const service = new ChannelSenderService(
    mail as unknown as MailService,
    webhook as unknown as WebhookClient,
  );
  return { service, mail, webhook };
}

const MESSAGE = { subject: 'Konu', text: 'metin', html: '<p>metin</p>' };

describe('ChannelSenderService.send', () => {
  it('email: MailService.send çağrılır', async () => {
    const { service, mail } = setup();

    await service.send(
      NotificationChannelType.Email,
      { to: ['a@example.com'] },
      MESSAGE,
    );

    expect(mail.send).toHaveBeenCalledWith({
      to: ['a@example.com'],
      subject: 'Konu',
      html: '<p>metin</p>',
      text: 'metin',
    });
  });

  it('discord: webhook content alanıyla POST edilir', async () => {
    const { service, webhook } = setup();

    await service.send(
      NotificationChannelType.Discord,
      { webhookUrl: 'https://discord.example/hook' },
      MESSAGE,
    );

    expect(webhook.post).toHaveBeenCalledWith(
      'https://discord.example/hook',
      expect.objectContaining({
        content: expect.stringContaining('metin') as string,
      }),
    );
  });

  it('slack: webhook text alanıyla POST edilir', async () => {
    const { service, webhook } = setup();

    await service.send(
      NotificationChannelType.Slack,
      { webhookUrl: 'https://hooks.slack.com/hook' },
      MESSAGE,
    );

    expect(webhook.post).toHaveBeenCalledWith(
      'https://hooks.slack.com/hook',
      expect.objectContaining({
        text: expect.stringContaining('metin') as string,
      }),
    );
  });

  it('webhook hatası yukarı fırlatılır', async () => {
    const { service, webhook } = setup();
    webhook.post.mockRejectedValue(new Error('HTTP 500'));

    await expect(
      service.send(
        NotificationChannelType.Slack,
        { webhookUrl: 'https://hooks.slack.com/hook' },
        MESSAGE,
      ),
    ).rejects.toThrow('HTTP 500');
  });
});
