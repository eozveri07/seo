import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateNotificationChannelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  /** Verilirse config tamamen değiştirilir (tip aynı kalır). */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
