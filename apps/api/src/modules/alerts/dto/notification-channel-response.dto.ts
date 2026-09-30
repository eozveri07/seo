import { ApiProperty } from '@nestjs/swagger';
import { CryptoService } from '../../../infra/crypto/crypto.service';
import {
  maskNotificationChannelConfig,
  NotificationChannelConfig,
} from '../notification-channel-config';
import {
  NotificationChannel,
  NotificationChannelType,
} from '../entities/notification-channel.entity';

/** `config_encrypted` hiçbir zaman response'a konmaz; yalnız maskelenmiş özet döner. */
export class NotificationChannelResponseDto {
  id!: string;
  name!: string;

  @ApiProperty({
    enum: NotificationChannelType,
    enumName: 'NotificationChannelType',
  })
  type!: NotificationChannelType;

  config!: Record<string, unknown>;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(
    channel: NotificationChannel,
    crypto: CryptoService,
  ): NotificationChannelResponseDto {
    const decrypted = JSON.parse(
      crypto.decrypt(channel.configEncrypted),
    ) as NotificationChannelConfig;
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      config: maskNotificationChannelConfig(channel.type, decrypted),
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }
}

export class NotificationChannelListResponseDto {
  items!: NotificationChannelResponseDto[];
}
