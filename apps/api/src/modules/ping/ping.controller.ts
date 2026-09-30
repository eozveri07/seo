import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { ApiOrgScoped } from '../../common/tenancy/api-org-scoped.decorator';
import { Queue } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import {
  Environment,
  EnvironmentVariables,
} from '../../config/environment-variables';
import { CurrentOrg } from '../../common/tenancy/current-org.decorator';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import { PingJobData, QueueName } from '../../infra/queue/queues';
import { CreatePingJobDto } from './dto/create-ping-job.dto';
import { PingJobResponseDto } from './dto/ping-job-response.dto';

/**
 * Dev-only örnek endpoint: `ping` kuyruğuna job ekler, worker ve
 * bull-board'un çalıştığını doğrulamak için. T1.5'te silinecek.
 */
@ApiTags('dev')
@ApiOrgScoped()
@Controller('dev/ping')
export class PingController {
  constructor(
    @InjectQueue(QueueName.Ping) private readonly queue: Queue<PingJobData>,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: PingJobResponseDto })
  async enqueue(
    @Body() dto: CreatePingJobDto,
    @CurrentOrg() org: TenantContext,
  ): Promise<PingJobResponseDto> {
    this.ensureDevelopment();

    const job = await this.queue.add(
      'ping',
      { orgId: org.orgId, message: dto.message },
      { jobId: `ping:${uuidv7()}` },
    );

    return { jobId: job.id ?? '' };
  }

  private ensureDevelopment(): void {
    if (
      this.configService.get('NODE_ENV', { infer: true }) !==
      Environment.Development
    ) {
      throw new NotFoundException();
    }
  }
}
