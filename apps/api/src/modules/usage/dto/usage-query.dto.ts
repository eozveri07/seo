import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property YYYY-MM-DD biçiminde olmalı';

export enum UsageGroupBy {
  Project = 'project',
  Provider = 'provider',
  Day = 'day',
}

export class UsageReportQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-28' })
  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ enum: UsageGroupBy, enumName: 'UsageGroupBy' })
  @IsOptional()
  @IsEnum(UsageGroupBy)
  groupBy: UsageGroupBy = UsageGroupBy.Provider;
}
