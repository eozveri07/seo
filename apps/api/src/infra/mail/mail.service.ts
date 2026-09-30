import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EnvironmentVariables } from '../../config/environment-variables';
import { MailSendFailedError } from './mail.errors';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

/**
 * ARCHITECTURE §11/§12: e-posta bildirimleri ve rapor ekleri nodemailer ile
 * gönderilir. `SMTP_HOST` boşsa (dev ortamı) gerçek bir SMTP sunucusuna
 * bağlanmadan `jsonTransport` kullanılır, gönderilecek içerik log'a yazılır.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async send(input: SendMailInput): Promise<void> {
    const transporter = this.getTransporter();
    const from = this.configService.get('MAIL_FROM', { infer: true });

    try {
      const info: { message?: unknown } = (await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      })) as { message?: unknown };

      if (!this.isSmtpConfigured()) {
        const to = Array.isArray(input.to) ? input.to.join(',') : input.to;
        this.logger.log(
          `dev mail transport (jsonTransport): to=${to} subject=${input.subject} message=${String(info.message)}`,
        );
      }
    } catch (error) {
      throw new MailSendFailedError(error);
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
    this.transporter = undefined;
  }

  private isSmtpConfigured(): boolean {
    return Boolean(this.configService.get('SMTP_HOST', { infer: true }));
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = this.isSmtpConfigured()
        ? createTransport({
            host: this.configService.get('SMTP_HOST', { infer: true }),
            port: this.configService.get('SMTP_PORT', { infer: true }) ?? 587,
            auth: this.buildAuth(),
          })
        : createTransport({ jsonTransport: true });
    }
    return this.transporter;
  }

  private buildAuth(): { user: string; pass: string } | undefined {
    const user = this.configService.get('SMTP_USER', { infer: true });
    const pass = this.configService.get('SMTP_PASSWORD', { infer: true });
    return user && pass ? { user, pass } : undefined;
  }
}
