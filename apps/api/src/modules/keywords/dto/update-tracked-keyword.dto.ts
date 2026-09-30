import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
} from 'class-validator';
import { TrackedKeywordFrequency } from '../entities/tracked-keyword.entity';

/**
 * `keyword`, `device`, `locationCode`, `languageCode` unique kısıtın
 * parçası; değiştirmek yeni bir kayıt anlamına gelir, bu yüzden burada yok.
 */
export class UpdateTrackedKeywordDto {
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsEnum(TrackedKeywordFrequency)
  frequency?: TrackedKeywordFrequency;

  @IsOptional()
  @IsUrl({ require_tld: false })
  targetUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
