import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { TrackedKeywordDevice } from '../entities/tracked-keyword.entity';

export class ListTrackedKeywordQueryDto extends PaginationQueryDto {
  /** Keyword metninde arama (ILIKE). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsEnum(TrackedKeywordDevice)
  device?: TrackedKeywordDevice;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;

  /** Etiketle filtre: keyword'ün tags dizisinde geçmeli. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tag?: string;
}
