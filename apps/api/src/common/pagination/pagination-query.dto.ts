import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_LIMIT = 200;

/** Sayfalı liste endpoint'lerinin ortak query'si (CLAUDE.md: limit en fazla 200). */
export class PaginationQueryDto {
  /** 1'den başlar. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = 50;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function pageOffset(query: PaginationQueryDto): number {
  return (query.page - 1) * query.limit;
}
