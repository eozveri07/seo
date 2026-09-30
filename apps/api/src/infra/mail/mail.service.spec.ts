import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { MailService } from './mail.service';
import { MailSendFailedError } from './mail.errors';

function buildConfigService(
  values: Partial<Record<string, string | number>> = {},
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) => values[key],
  } as ConfigService<EnvironmentVariables, true>;
}

describe('MailService', () => {
  it('SMTP_HOST tanımsızsa gerçek SMTP sunucusuna bağlanmadan gönderir (jsonTransport)', async () => {
    const service = new MailService(
      buildConfigService({ MAIL_FROM: 'noreply@example.com' }),
    );

    await expect(
      service.send({
        to: 'user@example.com',
        subject: 'Konu',
        html: '<p>merhaba</p>',
        text: 'merhaba',
      }),
    ).resolves.toBeUndefined();
  });

  it('ekli mail gönderebilir', async () => {
    const service = new MailService(
      buildConfigService({ MAIL_FROM: 'noreply@example.com' }),
    );

    await expect(
      service.send({
        to: 'user@example.com',
        subject: 'Rapor',
        html: '<p>rapor</p>',
        text: 'rapor',
        attachments: [
          { filename: 'rapor.pdf', content: Buffer.from('pdf-icerik') },
        ],
      }),
    ).resolves.toBeUndefined();
  });

  it('transporter hata verirse MailSendFailedError fırlatır', async () => {
    const service = new MailService(
      buildConfigService({ MAIL_FROM: 'noreply@example.com' }),
    );
    // @ts-expect-error private erişim, hata yolunu test etmek için transporter'ı bozuyoruz
    service.transporter = {
      sendMail: () => Promise.reject(new Error('smtp koptu')),
      close: () => undefined,
    };

    await expect(
      service.send({
        to: 'user@example.com',
        subject: 'Konu',
        html: '<p>merhaba</p>',
        text: 'merhaba',
      }),
    ).rejects.toBeInstanceOf(MailSendFailedError);
  });
});
