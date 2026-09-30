import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from '../entities/tracked-keyword.entity';

export class CreateTrackedKeywordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  keyword!: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsEnum(TrackedKeywordDevice)
  device?: TrackedKeywordDevice;

  /** Verilmezse projenin `dfsLocationCode`'u, o da yoksa varsayılan (US) kullanılır. */
  @IsOptional()
  @IsInt()
  locationCode?: number;

  /** Verilmezse projenin `dfsLanguageCode`'u, o da yoksa varsayılan (en) kullanılır. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;

  @IsOptional()
  @IsEnum(TrackedKeywordFrequency)
  frequency?: TrackedKeywordFrequency;

  @IsOptional()
  @IsUrl({ require_tld: false })
  targetUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}
