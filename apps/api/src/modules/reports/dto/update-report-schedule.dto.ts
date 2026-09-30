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
import {
  MAX_REPORT_SCHEDULE_RECIPIENTS,
  SCHEDULABLE_REPORT_TYPES,
} from './create-report-schedule.dto';

export class UpdateReportScheduleDto {
  @IsOptional()
  @IsIn(SCHEDULABLE_REPORT_TYPES)
  type?: ReportType;

  @IsOptional()
  @IsValidCron()
  cron?: string;

  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REPORT_SCHEDULE_RECIPIENTS)
  @IsEmail({}, { each: true })
  recipients?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
