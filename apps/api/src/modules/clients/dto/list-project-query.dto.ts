import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ListProjectQueryDto extends PaginationQueryDto {
  /** Proje adı ya da domaininde arama (ILIKE). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Yalnız bu client'ın projelerini döner. */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
