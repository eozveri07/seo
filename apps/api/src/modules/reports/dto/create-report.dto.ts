import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ReportType } from '../entities/report.entity';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property YYYY-MM-DD biçiminde olmalı';

/** `POST /projects/:projectId/reports`: manuel rapor oluşturma (ARCHITECTURE §12). */
export class CreateReportDto {
  @IsEnum(ReportType)
  type!: ReportType;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  periodStart!: string;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  periodEnd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  analystNote?: string;
}
