import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Dev-only; org X-Org-Id'den (TenantGuard) gelir. Bu endpoint T1.5'te silinecek. */
export class CreatePingJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}
