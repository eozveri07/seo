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

export enum Ga4SortField {
  Sessions = 'sessions',
  EngagedSessions = 'engagedSessions',
  KeyEvents = 'keyEvents',
  TotalRevenue = 'totalRevenue',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

/**
 * Tüm GA4 sorgularının tarih aralığı (UTC gün, iki uç dahil). Verilmezse
 * dünden geriye 28 gün (T1.5'teki `GscDateRangeQueryDto` kalıbı).
 */
export class Ga4DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;
}

export class ListGa4LandingPagesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;

  /** `channel_group` filtresi, ör. `Organic Search`. Sorgu tarafında uygulanır (ARCHITECTURE §5.4). */
  @ApiPropertyOptional({ example: 'Organic Search' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  channel?: string;

  /** Landing page metninde arama (ILIKE). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: Ga4SortField, enumName: 'Ga4SortField' })
  @IsOptional()
  @IsEnum(Ga4SortField)
  sort: Ga4SortField = Ga4SortField.Sessions;

  @ApiPropertyOptional({ enum: SortOrder, enumName: 'SortOrder' })
  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.Desc;
}
