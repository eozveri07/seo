import { ApiProperty } from '@nestjs/swagger';
import { ReportSchedule } from '../entities/report-schedule.entity';
import { ReportType } from '../entities/report.entity';

export class ReportScheduleResponseDto {
  id!: string;
  projectId!: string;

  @ApiProperty({ enum: ReportType, enumName: 'ReportType' })
  type!: ReportType;

  cron!: string;
  timezone!: string;
  recipients!: string[];
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(schedule: ReportSchedule): ReportScheduleResponseDto {
    return {
      id: schedule.id,
      projectId: schedule.projectId,
      type: schedule.type,
      cron: schedule.cron,
      timezone: schedule.timezone,
      recipients: schedule.recipients,
      isActive: schedule.isActive,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }
}

export class ReportScheduleListResponseDto {
  items!: ReportScheduleResponseDto[];
}
