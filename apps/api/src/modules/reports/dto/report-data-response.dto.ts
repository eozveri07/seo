import { ApiProperty } from '@nestjs/swagger';
import { ReportType } from '../entities/report.entity';

export class ReportPeriodMetricsDto {
  @ApiProperty() clicks!: number;
  @ApiProperty() impressions!: number;
  @ApiProperty() ctr!: number;
  @ApiProperty() position!: number;
  @ApiProperty() organicSessions!: number;
  @ApiProperty() organicKeyEvents!: number;
}

export class ReportGscTrendPointDto {
  @ApiProperty() date!: string;
  @ApiProperty() clicks!: number;
  @ApiProperty() impressions!: number;
  @ApiProperty() ctr!: number;
  @ApiProperty() position!: number;
}

export class ReportKeywordDistributionDto {
  @ApiProperty() top3!: number;
  @ApiProperty() top10!: number;
  @ApiProperty() top20!: number;
  @ApiProperty() top100!: number;
  @ApiProperty() beyond!: number;
  @ApiProperty() total!: number;
}

export class ReportKeywordMoverDto {
  @ApiProperty() trackedKeywordId!: string;
  @ApiProperty() keyword!: string;
  @ApiProperty({ nullable: true, type: Number }) position!: number | null;
  @ApiProperty({ nullable: true, type: Number }) change30d!: number | null;
}

export class ReportTopPageDto {
  @ApiProperty() page!: string;
  @ApiProperty() clicks!: number;
  @ApiProperty() impressions!: number;
  @ApiProperty() ctr!: number;
  @ApiProperty() position!: number;
}

/** `GET /reports/:id/data` (report token ile): print route'unun çizdiği içerik. */
export class ReportDataResponseDto {
  @ApiProperty() reportId!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() clientName!: string;
  @ApiProperty({ type: Object }) branding!: Record<string, unknown>;
  @ApiProperty({ enum: ReportType, enumName: 'ReportType' }) type!: ReportType;
  @ApiProperty() periodStart!: string;
  @ApiProperty() periodEnd!: string;
  @ApiProperty() previousPeriodStart!: string;
  @ApiProperty() previousPeriodEnd!: string;
  @ApiProperty({ type: ReportPeriodMetricsDto })
  period!: ReportPeriodMetricsDto;
  @ApiProperty({ type: ReportPeriodMetricsDto })
  previousPeriod!: ReportPeriodMetricsDto;
  @ApiProperty({ type: ReportGscTrendPointDto, isArray: true })
  gscTrend!: ReportGscTrendPointDto[];
  @ApiProperty({ type: ReportKeywordDistributionDto })
  keywordDistribution!: ReportKeywordDistributionDto;
  @ApiProperty({ type: ReportKeywordMoverDto, isArray: true })
  topGainers!: ReportKeywordMoverDto[];
  @ApiProperty({ type: ReportKeywordMoverDto, isArray: true })
  topLosers!: ReportKeywordMoverDto[];
  @ApiProperty({ type: ReportTopPageDto, isArray: true })
  topPages!: ReportTopPageDto[];
  @ApiProperty({ nullable: true, type: String }) analystNote!: string | null;
  @ApiProperty() generatedAt!: string;
}
