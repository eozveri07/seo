import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
} from 'class-validator';
import { ReportType } from '../entities/report.entity';
import { IsIanaTimezone, IsValidCron } from '../validators';

export const MAX_REPORT_SCHEDULE_RECIPIENTS = 20;

/** Schedule'lar yalnız periyodik tipleri üretir; `custom` yalnız manuel raporlarda. */
export const SCHEDULABLE_REPORT_TYPES = [
  ReportType.Weekly,
  ReportType.Monthly,
] as const;

export class CreateReportScheduleDto {
  @IsIn(SCHEDULABLE_REPORT_TYPES)
  type!: ReportType;

  @IsValidCron()
  cron!: string;

  @IsIanaTimezone()
  timezone!: string;

  @IsArray()
  @ArrayMaxSize(MAX_REPORT_SCHEDULE_RECIPIENTS)
  @IsEmail({}, { each: true })
  recipients!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
