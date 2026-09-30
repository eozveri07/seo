import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { JobRunRecorder } from './job-run-recorder';
import { BaseJobData, QueueJobDataMap, QueueName } from './queues';

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
 * Tüm processor'ların temeli (CLAUDE.md kural 3: processor ince, service kalın).
 * Job data'daki `orgId`'yi doğrular, CLS'e yazar, `JobRunRecorder` ile
 * start/succeed/fail kaydını açıp kapatır ve gerçek işi `handle`'a devreder.
 */
export abstract class BaseProcessor<Name extends QueueName> extends WorkerHost {
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

    const context = {
      queueName: this.queueName,
      jobId: job.id ?? 'unknown',
      orgId: data.orgId,
      projectId: data.projectId,
    };

    return this.cls.run(async () => {
      this.cls.set('orgId', context.orgId);
      this.logger.log(
        `job başladı: queue=${context.queueName} jobId=${context.jobId} orgId=${context.orgId}` +
          (context.projectId ? ` projectId=${context.projectId}` : ''),
      );
      await this.jobRunRecorder.start(context);
      try {
        const result = await this.handle(job);
        await this.jobRunRecorder.succeed(context);
        return result;
      } catch (error) {
        await this.jobRunRecorder.fail(context, error);
        throw error;
      }
    });
  }

  protected abstract handle(job: Job<QueueJobDataMap[Name]>): Promise<unknown>;
}
