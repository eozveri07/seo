import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListKeywordGroupQueryDto extends PaginationQueryDto {
  /** Grup adında arama (ILIKE). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
