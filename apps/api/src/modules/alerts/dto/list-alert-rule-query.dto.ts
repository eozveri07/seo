import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { AlertRuleType } from '../entities/alert-rule.entity';

export class ListAlertRuleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AlertRuleType)
  type?: AlertRuleType;
}
