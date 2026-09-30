import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Dev-only: gerçek tenant auth henüz yok (T1.1/T1.2), bu yüzden orgId
 * doğrudan body'den alınır. Bu endpoint T1.5'te silinecek.
 */
export class CreatePingJobDto {
  @ApiProperty()
  @IsUUID()
  orgId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;
}
