import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import {
  JobRunContext,
  JobRunRecorder,
  StartedJobRunContext,
} from './job-run-recorder';
import {
  BaseJobData,
  JobTrigger,
  QueueJobDataMap,
  TenantQueueName,
} from './queues';

/** Job data'da `orgId` yoksa: kuyruğa hatalı veri girmiş, işlenemez. */
export class MissingOrgIdError extends Error {
  constructor(queueName: string, jobId: string | undefined) {
    super(
      `Job data'da orgId yok: queue=${queueName} jobId=${jobId ?? 'unknown'}`,
    );
    this.name = 'MissingOrgIdError';
  }
}

/**
 * Tenant job'larının temeli (CLAUDE.md kural 3: processor ince, service kalın).
 * Job data'daki `orgId`'yi doğrular, CLS'e yazar, `JobRunRecorder` ile
 * `job_runs` kaydını açıp kapatır ve gerçek işi `handle`'a devreder.
 *
 * İlk denemede açılan kaydın id'si job data'ya (`runId`) yazılır; böylece
 * BullMQ'nun yeniden denemeleri aynı kaydı günceller. `handle`'ın düz obje
 * sonucu kaydın `stats`'ına yazılır.
 */
export abstract class BaseProcessor<
  Name extends TenantQueueName,
> extends WorkerHost {
  protected abstract readonly queueName: Name;
  protected abstract readonly logger: Logger;

  constructor(
    protected readonly cls: ClsService<AppClsStore>,
    private readonly jobRunRecorder: JobRunRecorder,
  ) {
    super();
  }

  async process(job: Job<QueueJobDataMap[Name]>): Promise<unknown> {
    const data: BaseJobData = job.data;
    if (!data?.orgId) {
      throw new MissingOrgIdError(this.queueName, job.id);
    }

    const context: JobRunContext = {
      queueName: this.queueName,
      jobId: job.id ?? 'unknown',
      orgId: data.orgId,
      projectId: data.projectId,
      runId: data.runId,
      trigger: data.trigger ?? JobTrigger.Schedule,
    };

    return this.cls.run(async () => {
      this.cls.set('orgId', context.orgId);
      this.logger.log(
        `job başladı: queue=${context.queueName} jobId=${context.jobId} orgId=${context.orgId}` +
          (context.projectId ? ` projectId=${context.projectId}` : ''),
      );
      const runId = await this.jobRunRecorder.start(context);
      if (runId !== data.runId) {
        await job.updateData({ ...job.data, runId });
      }
      const started: StartedJobRunContext = { ...context, runId };
      try {
        const result = await this.handle(job);
        await this.jobRunRecorder.succeed(started, toStats(result));
        return result;
      } catch (error) {
        await this.jobRunRecorder.fail(
          started,
          error,
          isFinalAttempt(job, error),
        );
        throw error;
      }
    });
  }

  protected abstract handle(job: Job<QueueJobDataMap[Name]>): Promise<unknown>;
}

/**
 * Bu deneme başarısız olursa BullMQ yeniden denemeyecek mi? `attemptsMade`
 * deneme bittikten sonra artar; işlem sırasında 0'dan başlar.
 */
export function isFinalAttempt(job: Job, error: unknown): boolean {
  if (error instanceof UnrecoverableError) {
    return true;
  }
  const attempts = job.opts?.attempts ?? 1;
  return (job.attemptsMade ?? 0) + 1 >= attempts;
}

function toStats(result: unknown): Record<string, unknown> | undefined {
  if (
    typeof result === 'object' &&
    result !== null &&
    Object.getPrototypeOf(result) === Object.prototype
  ) {
    return result as Record<string, unknown>;
  }
  return undefined;
}
