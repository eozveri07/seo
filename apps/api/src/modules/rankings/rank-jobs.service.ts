import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { rankLiveJobId, rankPostJobId } from '../../infra/queue/job-ids';
import {
  JOB_PRIORITY,
  JobTrigger,
  QueueName,
  RankFetchJobData,
  RankPostJobData,
  RankPostScope,
} from '../../infra/queue/queues';
import {
  DailyDispatchSource,
  DispatchItem,
} from '../dispatch/daily-dispatch-source';
import { WeeklyDispatchSource } from '../dispatch/weekly-dispatch-source';
import { JobRunsService } from '../jobs/job-runs.service';
import { TrackedKeywordFrequency } from '../keywords/entities/tracked-keyword.entity';
import { RankableKeywordsService } from '../keywords/rankable-keywords.service';

/** `rank-fetch` kuyruğundaki anlık kontrol job'unun adı. */
export const RANK_LIVE_JOB_NAME = 'rank-live';

/**
 * Rank job'larını kuyruğa ekler: `daily-dispatch` ve `weekly-dispatch`
 * kaynağı (proje başına bir `rank-post`, deterministik jobId) ve anlık
 * kontrol (CLAUDE.md kural 6: `job_runs` kaydı açılır, `runId` döner).
 */
@Injectable()
export class RankJobsService
  implements DailyDispatchSource, WeeklyDispatchSource
{
  constructor(
    @InjectQueue(QueueName.RankPost)
    private readonly postQueue: Queue<RankPostJobData>,
    @InjectQueue(QueueName.RankFetch)
    private readonly fetchQueue: Queue<RankFetchJobData>,
    private readonly keywords: RankableKeywordsService,
    private readonly jobRuns: JobRunsService,
  ) {}

  /**
   * Günlük keyword'ü ya da haftalık keyword'ü olan projeler: haftalıklar bu
   * hafta kontrol edilmediyse günlük dispatch'te de gönderilir
   * (`RankPostService`).
   */
  async collect(date: string): Promise<DispatchItem[]> {
    return this.items(date, 'daily', [
      TrackedKeywordFrequency.Daily,
      TrackedKeywordFrequency.Weekly,
    ]);
  }

  async collectWeekly(date: string): Promise<DispatchItem[]> {
    return this.items(date, 'weekly', [TrackedKeywordFrequency.Weekly]);
  }

  /** `POST /projects/:id/keywords/:kid/check-now`: `rank-fetch` kuyruğunda live kontrol. */
  async triggerCheckNow(
    orgId: string,
    projectId: string,
    trackedKeywordId: string,
    today: string,
  ): Promise<string> {
    // Keyword projede yoksa 404 (TRACKED_KEYWORD_NOT_FOUND); kayıt açılmaz.
    await this.keywords.findOne(projectId, trackedKeywordId);

    const run = await this.jobRuns.createQueued({
      type: RANK_LIVE_JOB_NAME,
      projectId,
      trigger: JobTrigger.Manual,
    });
    const jobId = rankLiveJobId(projectId, run.id);
    try {
      await this.fetchQueue.add(
        RANK_LIVE_JOB_NAME,
        {
          kind: 'live',
          orgId,
          projectId,
          trackedKeywordId,
          date: today,
          runId: run.id,
          trigger: JobTrigger.Manual,
        },
        // Ücretli çağrı: yeniden denenmez (client geçici hataları kendisi dener).
        { jobId, attempts: 1, priority: JOB_PRIORITY.daily },
      );
    } catch (error) {
      await this.jobRuns.fail(
        {
          queueName: QueueName.RankFetch,
          jobId,
          orgId,
          projectId,
          runId: run.id,
          trigger: JobTrigger.Manual,
        },
        error,
        true,
      );
      throw error;
    }
    await this.jobRuns.attachBullmqJob(run.id, jobId);
    return run.id;
  }

  private async items(
    date: string,
    scope: RankPostScope,
    frequencies: TrackedKeywordFrequency[],
  ): Promise<DispatchItem[]> {
    const projects = await this.keywords.listProjectsForRank(frequencies);
    return projects.map(({ orgId, projectId }) => ({
      orgId,
      projectId,
      kind: `${QueueName.RankPost}-${scope}`,
      enqueue: async () => {
        await this.postQueue.add(
          QueueName.RankPost,
          { orgId, projectId, date, scope, trigger: JobTrigger.Schedule },
          {
            jobId: rankPostJobId(projectId, date, scope),
            priority: JOB_PRIORITY.daily,
          },
        );
      },
    }));
  }
}
