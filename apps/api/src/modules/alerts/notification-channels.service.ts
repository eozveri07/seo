import { Injectable } from '@nestjs/common';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ChannelSenderService } from './channel-sender.service';
import {
  NotificationChannel,
  NotificationChannelType,
} from './entities/notification-channel.entity';
import {
  NotificationChannelNotFoundError,
  NotificationChannelTestFailedError,
} from './alerts.errors';
import {
  NotificationChannelConfig,
  validateNotificationChannelConfig,
} from './notification-channel-config';

export interface CreateNotificationChannelInput {
  type: NotificationChannelType;
  name: string;
  config: Record<string, unknown>;
}

export interface UpdateNotificationChannelInput {
  name?: string;
  config?: Record<string, unknown>;
}

/**
 * Org seviyesinde bildirim kanalı CRUD'u ve test gönderimi (ARCHITECTURE
 * §5.7, §11). `config`, `CryptoService` ile şifreli saklanır; düz metin
 * yalnız burada, gönderim ve test sırasında çözülür.
 */
@Injectable()
export class NotificationChannelsService {
  constructor(
    @InjectTenantRepository(NotificationChannel)
    private readonly channels: TenantRepository<NotificationChannel>,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly channelSender: ChannelSenderService,
  ) {}

  async list(): Promise<NotificationChannel[]> {
    return this.channels.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<NotificationChannel> {
    const channel = await this.channels.findOneBy({ id });
    if (!channel) {
      throw new NotificationChannelNotFoundError();
    }
    return channel;
  }

  async create(
    input: CreateNotificationChannelInput,
  ): Promise<NotificationChannel> {
    const validated = validateNotificationChannelConfig(
      input.type,
      input.config,
    );
    const channel = await this.channels.save({
      type: input.type,
      name: input.name.trim(),
      configEncrypted: this.crypto.encrypt(JSON.stringify(validated)),
    });
    await this.audit.record({
      action: AuditAction.NotificationChannelCreated,
      entityType: 'notification_channel',
      entityId: channel.id,
      changes: { type: channel.type, name: channel.name },
    });
    return channel;
  }

  async update(
    id: string,
    input: UpdateNotificationChannelInput,
  ): Promise<NotificationChannel> {
    const channel = await this.findOne(id);
    const patch: Partial<NotificationChannel> = {};
    if (input.name !== undefined) {
      patch.name = input.name.trim();
    }
    if (input.config !== undefined) {
      const validated = validateNotificationChannelConfig(
        channel.type,
        input.config,
      );
      patch.configEncrypted = this.crypto.encrypt(JSON.stringify(validated));
    }
    if (Object.keys(patch).length === 0) {
      return channel;
    }
    await this.channels.save({ ...channel, ...patch });
    await this.audit.record({
      action: AuditAction.NotificationChannelUpdated,
      entityType: 'notification_channel',
      entityId: channel.id,
      changes: { name: patch.name },
    });
    return Object.assign(channel, patch);
  }

  async delete(id: string): Promise<void> {
    const channel = await this.findOne(id);
    await this.channels.delete({ id: channel.id });
    await this.audit.record({
      action: AuditAction.NotificationChannelDeleted,
      entityType: 'notification_channel',
      entityId: channel.id,
      changes: { type: channel.type, name: channel.name },
    });
  }

  /** `POST /notification-channels/:id/test`: örnek bir mesaj gönderir. */
  async test(id: string): Promise<void> {
    const channel = await this.findOne(id);
    const config = JSON.parse(
      this.crypto.decrypt(channel.configEncrypted),
    ) as NotificationChannelConfig;
    try {
      await this.channelSender.send(channel.type, config, {
        subject: 'Test bildirimi',
        text: `${channel.name} kanalı doğru yapılandırılmış görünüyor. Bu bir test mesajıdır.`,
        html: `<p><strong>${channel.name}</strong> kanalı doğru yapılandırılmış görünüyor. Bu bir test mesajıdır.</p>`,
      });
    } catch (error) {
      throw new NotificationChannelTestFailedError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
