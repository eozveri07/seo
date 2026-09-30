import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TrackedKeywordDevice } from '../entities/tracked-keyword.entity';

/** Satır başına en fazla bu kadar karakter (uzun satırlar hatalı kabul edilir). */
export const BULK_ADD_MAX_LINE_LENGTH = 500;
/** İstek başına en fazla satır sayısı (PLAN.md T1.8). */
export const BULK_ADD_MAX_LINES = 1000;

export class BulkAddKeywordsDto {
  /**
   * Satır satır metin. Her satır ya sadece `keyword`, ya da virgülle ayrılmış
   * `keyword,grup,cihaz,hedef url` (CSV) biçiminde olabilir; grup/cihaz/hedef
   * url boş bırakılabilir ve o durumda `defaultGroupName`/`defaultDevice`
   * kullanılır.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(BULK_ADD_MAX_LINES * (BULK_ADD_MAX_LINE_LENGTH + 1), {
    message: 'text çok uzun.',
  })
  text!: string;

  /** Satırda grup verilmezse kullanılacak grup adı; yoksa grupsuz eklenir. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultGroupName?: string;

  /** Satırda cihaz verilmezse kullanılacak varsayılan; yoksa `desktop`. */
  @IsOptional()
  @IsEnum(TrackedKeywordDevice)
  defaultDevice?: TrackedKeywordDevice;
}
