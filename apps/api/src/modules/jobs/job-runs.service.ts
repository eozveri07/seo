import { Injectable } from '@nestjs/common';
import { QueryDeepPartialEntity } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import {
  JobRunContext,
  JobRunRecorder,
  StartedJobRunContext,
} from '../../infra/queue/job-run-recorder';
import { JobTrigger } from '../../infra/queue/queues';
import { JobRun, JobRunStatus } from './entities/job-run.entity';

/** `job_runs.error`'a yazılan mesajın üst sınırı. */
const MAX_ERROR_LENGTH = 2000;

export interface CreateQueuedRunInput {
  type: string;
  projectId?: string;
  trigger: JobTrigger;
}

/**
 * `job_runs` kayıtları (ARCHITECTURE §5.6). Manuel tetiklemede API kaydı
 * `queued` açar ve id'sini `runId` olarak döner; worker'da `BaseProcessor`
 * aynı servisi `JobRunRecorder` olarak kullanır. Tüm erişim
 * `TenantRepository` üzerinden org kapsamlıdır (job'larda CLS'i
 * `BaseProcessor` kurar).
 */
@Injectable()
export class JobRunsService implements JobRunRecorder {
  constructor(
    @InjectTenantRepository(JobRun)
    private readonly runs: TenantRepository<JobRun>,
  ) {}

  async createQueued(input: CreateQueuedRunInput): Promise<JobRun> {
    return this.runs.save({
      type: input.type,
      projectId: input.projectId ?? null,
      trigger: input.trigger,
      status: JobRunStatus.Queued,
    });
  }

  async attachBullmqJob(runId: string, bullmqJobId: string): Promise<void> {
    await this.runs.update({ id: runId }, { bullmqJobId });
  }

  async findOne(runId: string): Promise<JobRun | null> {
    return this.runs.findOneBy({ id: runId });
  }

  async start(context: JobRunContext): Promise<string> {
    const startedAt = new Date();
    if (context.runId) {
      const result = await this.runs.update(
        { id: context.runId },
        {
          status: JobRunStatus.Running,
          bullmqJobId: context.jobId,
          startedAt,
          finishedAt: null,
        },
      );
      if (result.affected) {
        return context.runId;
      }
    }

    const run = await this.runs.save({
      // Kayıt silinmişse (ör. temizlik) job data'daki id yeniden kullanılır.
      id: context.runId ?? uuidv7(),
      type: context.queueName,
      projectId: context.projectId ?? null,
      trigger: context.trigger,
      status: JobRunStatus.Running,
      bullmqJobId: context.jobId,
      startedAt,
    });
    return run.id;
  }

  async succeed(
    context: StartedJobRunContext,
    stats?: Record<string, unknown>,
  ): Promise<void> {
    await this.runs.update(
      { id: context.runId },
      {
        status: JobRunStatus.Succeeded,
        finishedAt: new Date(),
        // jsonb: QueryDeepPartialEntity `Record<string, unknown>`'u daraltamıyor.
        stats: (stats ?? null) as QueryDeepPartialEntity<JobRun>['stats'],
        error: null,
      },
    );
  }

  async fail(
    context: StartedJobRunContext,
    error: unknown,
    final: boolean,
  ): Promise<void> {
    await this.runs.update(
      { id: context.runId },
      {
        status: final ? JobRunStatus.Failed : JobRunStatus.Queued,
        finishedAt: final ? new Date() : null,
        error: describeError(error),
      },
    );
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}
