import { ApiProperty } from '@nestjs/swagger';

export class GscSyncResponseDto {
  /** `job_runs` kaydının id'si; durum bu kayıttan izlenir. */
  runId!: string;
}

export class GscTotalsDto {
  clicks!: number;
  impressions!: number;
  /** clicks / impressions (0-1). */
  ctr!: number;
  /** Gösterimle ağırlıklı ortalama pozisyon. */
  position!: number;
}

export class GscDailyPointDto extends GscTotalsDto {
  @ApiProperty({ example: '2026-09-28' })
  date!: string;
}

export class GscPeriodDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-09-28' })
  to!: string;

  totals!: GscTotalsDto;
  series!: GscDailyPointDto[];
}

/** Site toplamları `gsc_site_daily`'den (anonim sorgular dahil). */
export class GscOverviewResponseDto extends GscPeriodDto {
  @ApiProperty({ type: GscPeriodDto, nullable: true })
  compare!: GscPeriodDto | null;
}

export class GscQueryRowDto extends GscTotalsDto {
  /** `md5(query)`; `queries/:hash/pages` için. */
  queryHash!: string;
  query!: string;
}

export class GscPageRowDto extends GscTotalsDto {
  /** `md5(page)`; `pages/:hash/queries` için. */
  pageHash!: string;
  page!: string;
}

export class GscQueryListResponseDto {
  items!: GscQueryRowDto[];
  total!: number;
  page!: number;
  limit!: number;
}

export class GscPageListResponseDto {
  items!: GscPageRowDto[];
  total!: number;
  page!: number;
  limit!: number;
}
