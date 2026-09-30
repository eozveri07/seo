import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ConnectionType } from '../entities/connection.entity';

export class CreateConnectionDto {
  @IsEnum(ConnectionType)
  type!: ConnectionType;

  /** GSC: `sc-domain:example.com` ya da `https://example.com/`. GA4: `properties/123456789`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  externalId!: string;
}
