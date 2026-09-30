import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListClientQueryDto extends PaginationQueryDto {
  /** Client adında arama (ILIKE). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
