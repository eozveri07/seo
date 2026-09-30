import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '../../../database/entities/tenant-scoped.entity';

/** ARCHITECTURE §11: Faz 1'de desteklenen bildirim kanalı tipleri. */
export enum NotificationChannelType {
  Email = 'email',
  Discord = 'discord',
  Slack = 'slack',
}

/**
 * Org seviyesinde bildirim kanalı (ARCHITECTURE §5.7). `config_encrypted`
 * `CryptoService` ile şifrelenir; webhook URL'leri de secret sayılır, düz
 * metin hiçbir zaman response'a ya da log'a yazılmaz.
 *
 * Şifre çözülmüş config şekli tipe göre değişir:
 * - `email`: `{ to: string[] }`
 * - `discord` / `slack`: `{ webhookUrl: string }`
 */
@Entity('notification_channels')
@Index('IDX_notification_channels_org_id', ['orgId'])
export class NotificationChannel extends TenantScopedEntity {
  @Column({
    type: 'enum',
    enum: NotificationChannelType,
    enumName: 'notification_channel_type',
  })
  type!: NotificationChannelType;

  @Column('text')
  name!: string;

  @Column('text')
  configEncrypted!: string;
}
