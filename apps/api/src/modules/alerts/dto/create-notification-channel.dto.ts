import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationChannelType } from '../entities/notification-channel.entity';

export class CreateNotificationChannelDto {
  @IsEnum(NotificationChannelType)
  type!: NotificationChannelType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /**
   * Tipine göre şekli değişir: `email` -> `{ to: string[] }`,
   * `discord`/`slack` -> `{ webhookUrl: string }`. `notification-channel-config.ts`
   * doğrular; servis şifreleyip saklar, düz metin hiçbir zaman response'a yazılmaz.
   */
  @IsObject()
  config!: Record<string, unknown>;
}
