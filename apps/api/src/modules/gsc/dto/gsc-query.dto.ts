import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property YYYY-MM-DD biçiminde olmalı';

export enum GscCompareMode {
  /** Aynı uzunlukta, hemen önceki dönem. */
  Previous = 'previous',
  /** Bir yıl önceki aynı tarihler. */
  Year = 'year',
}

export enum GscSortField {
  Clicks = 'clicks',
  Impressions = 'impressions',
  Ctr = 'ctr',
  Position = 'position',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

/**
 * Tüm GSC sorgularının tarih aralığı (UTC gün, iki uç dahil). Verilmezse
 * dünden geriye 28 gün.
 */
export class GscDateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;
}

export class GscOverviewQueryDto extends GscDateRangeQueryDto {
  @ApiPropertyOptional({ enum: GscCompareMode, enumName: 'GscCompareMode' })
  @IsOptional()
  @IsEnum(GscCompareMode)
  compare?: GscCompareMode;
}

export class ListGscRowsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;

  /** Sorgu ya da sayfa metninde arama (ILIKE, trigram index'li). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: GscSortField, enumName: 'GscSortField' })
  @IsOptional()
  @IsEnum(GscSortField)
  sort: GscSortField = GscSortField.Clicks;

  @ApiPropertyOptional({ enum: SortOrder, enumName: 'SortOrder' })
  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.Desc;
}
