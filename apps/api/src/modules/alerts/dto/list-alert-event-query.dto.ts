import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListAlertEventQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  ruleId?: string;
}
