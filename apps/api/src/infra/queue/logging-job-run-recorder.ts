import { Injectable, Logger } from '@nestjs/common';
import { JobRunContext, JobRunRecorder } from './job-run-recorder';

/**
 * `job_runs` tablosu gelene kadar (T1.5) kaydı yalnız loglayan geçici
 * implementasyon.
 */
@Injectable()
export class LoggingJobRunRecorder implements JobRunRecorder {
  private readonly logger = new Logger(LoggingJobRunRecorder.name);

  start(context: JobRunContext): Promise<void> {
    this.logger.log(this.format('başladı', context));
    return Promise.resolve();
  }

  succeed(context: JobRunContext): Promise<void> {
    this.logger.log(this.format('tamamlandı', context));
    return Promise.resolve();
  }

  fail(context: JobRunContext, error: unknown): Promise<void> {
    this.logger.error(
      this.format('başarısız', context),
      error instanceof Error ? error.stack : String(error),
    );
    return Promise.resolve();
  }

  private format(status: string, context: JobRunContext): string {
    const parts = [
      `queue=${context.queueName}`,
      `jobId=${context.jobId}`,
      `orgId=${context.orgId}`,
    ];
    if (context.projectId) {
      parts.push(`projectId=${context.projectId}`);
    }
    return `job ${status}: ${parts.join(' ')}`;
  }
}
