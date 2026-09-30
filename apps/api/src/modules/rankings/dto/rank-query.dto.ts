import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property YYYY-MM-DD biçiminde olmalı';

/** Tek istekte geçmişi istenebilecek en fazla keyword. */
export const MAX_HISTORY_KEYWORDS = 50;

/**
 * `GET rankings/history`. `keywordIds` virgülle ayrılmış liste ya da tekrar
 * eden parametre olabilir. Tarih verilmezse bugünden geriye 30 gün.
 */
export class RankHistoryQueryDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: `Virgülle ayrılmış ya da tekrar eden; en fazla ${MAX_HISTORY_KEYWORDS}.`,
  })
  @Transform(({ value }: { value: unknown }) => toIdList(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_HISTORY_KEYWORDS)
  @IsUUID('all', { each: true })
  keywordIds!: string[];

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;
}

/** `GET rankings/serp/:keywordId`. `date` verilmezse en son sonuç. */
export class RankSerpQueryDto {
  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  date?: string;
}

/** `?keywordIds=a,b` ve `?keywordIds=a&keywordIds=b` biçimlerini tek listeye çevirir. */
function toIdList(value: unknown): unknown {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '' && item !== undefined);
}
