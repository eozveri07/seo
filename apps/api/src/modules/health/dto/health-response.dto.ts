import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthCheckResultDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status!: 'up' | 'down';

  @ApiPropertyOptional()
  latencyMs?: number;

  @ApiPropertyOptional()
  error?: string;
}

export class HealthChecksDto {
  @ApiProperty({ type: HealthCheckResultDto })
  database!: HealthCheckResultDto;

  @ApiProperty({ type: HealthCheckResultDto })
  redis!: HealthCheckResultDto;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  status!: 'ok' | 'error';

  @ApiProperty({ type: HealthChecksDto })
  checks!: HealthChecksDto;
}
