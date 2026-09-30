import { ApiProperty } from '@nestjs/swagger';

export class ProjectDailySummaryPointDto {
  @ApiProperty({ example: '2026-09-28' })
  date!: string;

  gscClicks!: number;
  gscImpressions!: number;
  gscCtr!: number;
  gscPosition!: number;
  organicSessions!: number;
  organicKeyEvents!: number;
  kwTracked!: number;
  kwTop3!: number;
  kwTop10!: number;
  kwTop20!: number;
  kwTop100!: number;
  kwAvgPosition!: number | null;
  visibilityScore!: number;
}

export class ProjectSummaryResponseDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-09-28' })
  to!: string;

  points!: ProjectDailySummaryPointDto[];
}

/** `GET /projects/summary`: N ve N-7/N-28 karşılaştırması; `null` o güne ait veri henüz yok demektir. */
export class ProjectSummaryMetricDto {
  value!: number | null;
  change7d!: number | null;
  change28d!: number | null;
}

export class ProjectSummaryCardDto {
  projectId!: string;
  projectName!: string;
  clientId!: string;
  /** Son özetin ait olduğu gün; hiç özet yoksa `null`. */
  date!: string | null;
  clicks!: ProjectSummaryMetricDto;
  organicSessions!: ProjectSummaryMetricDto;
  avgPosition!: ProjectSummaryMetricDto;
  visibilityScore!: ProjectSummaryMetricDto;
  /** Son 28 günün visibility skoru serisi (mini grafik), eskiden yeniye. */
  visibilitySeries!: number[];
}

export class ProjectSummaryCardsResponseDto {
  items!: ProjectSummaryCardDto[];
}
