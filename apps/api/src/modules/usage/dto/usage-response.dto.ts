import { ApiProperty } from '@nestjs/swagger';
import { UsageGroupBy } from './usage-query.dto';

export class UsageReportRowDto {
  /** `groupBy`'a göre: `project_id`, `provider` ya da `YYYY-MM-DD`. */
  key!: string;
  cost!: number;
  units!: number;
}

export class UsageReportResponseDto {
  @ApiProperty({ example: '2026-09-01' })
  from!: string;

  @ApiProperty({ example: '2026-09-28' })
  to!: string;

  @ApiProperty({ enum: UsageGroupBy, enumName: 'UsageGroupBy' })
  groupBy!: UsageGroupBy;

  items!: UsageReportRowDto[];
  totalCost!: number;
  totalUnits!: number;
}
