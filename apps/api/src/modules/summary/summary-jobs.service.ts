import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { summaryJobId } from '../../infra/queue/job-ids';
import {
  JobTrigger,
  QueueName,
  SummaryJobData,
} from '../../infra/queue/queues';

/**
 * `summary` job'unu kuyruğa ekler (T1.10). `sync.completed` (gsc/ga4) ve
 * `rank.day_completed` sonrası çağrılır; deterministik jobId
 * (`summary:{projectId}:{date}`) aynı gün birden fazla tetiklemede tek job'a
 * düşürür (CLAUDE.md kural 7).
 */
@Injectable()
export class SummaryJobsService {
  private readonly logger = new Logger(SummaryJobsService.name);

  constructor(
    @InjectQueue(QueueName.Summary)
    private readonly queue: Queue<SummaryJobData>,
  ) {}

  async enqueue(orgId: string, projectId: string, date: string): Promise<void> {
    await this.queue.add(
      QueueName.Summary,
      { orgId, projectId, date, trigger: JobTrigger.System },
      { jobId: summaryJobId(projectId, date) },
    );
    this.logger.log(
      `summary job eklendi: orgId=${orgId} projectId=${projectId} date=${date}`,
    );
  }
}
