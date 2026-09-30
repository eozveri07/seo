import { ApiProperty } from '@nestjs/swagger';
import { Report, ReportStatus, ReportType } from '../entities/report.entity';

export class ReportResponseDto {
  id!: string;
  projectId!: string;

  @ApiProperty({ enum: ReportType, enumName: 'ReportType' })
  type!: ReportType;

  periodStart!: string;
  periodEnd!: string;

  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatus' })
  status!: ReportStatus;

  fileSize!: number | null;
  generatedAt!: Date | null;
  sentAt!: Date | null;
  sentTo!: string[];
  error!: string | null;
  analystNote!: string | null;
  createdBy!: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(report: Report): ReportResponseDto {
    return {
      id: report.id,
      projectId: report.projectId,
      type: report.type,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status: report.status,
      fileSize: report.fileSize,
      generatedAt: report.generatedAt,
      sentAt: report.sentAt,
      sentTo: report.sentTo,
      error: report.error,
      analystNote: report.analystNote,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}

export class ReportListResponseDto {
  items!: ReportResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}

export class CreateReportResponseDto {
  runId!: string;
}
