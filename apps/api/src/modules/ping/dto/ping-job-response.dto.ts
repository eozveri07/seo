import { ApiProperty } from '@nestjs/swagger';

export class PingJobResponseDto {
  @ApiProperty()
  jobId!: string;
}
