import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { runInTenant } from '../../common/tenancy/run-in-tenant';
import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import { rankFetchJobId } from '../../infra/queue/job-ids';
import {
  JobTrigger,
  QueueName,
  RankFetchJobData,
} from '../../infra/queue/queues';
import { RankDayCompletion } from './rank-day-completion';
import { RankStore } from './rank-store';

/** ARCHITECTURE §9.3: bu süre içinde sonuçlanmayan task `failed` olur. */
export const STALE_RANK_TASK_HOURS = 24;
const HOUR_MS = 3_600_000;

export interface RankPollStats {
  /** `failed`'a çekilen takılı task'ların etkilediği proje-günleri. */
  staleDays: number;
  /** `tasks_ready`'nin döndüğü task sayısı (hesap geneli). */
  ready: number;
  /** `rank-fetch` kuyruğuna eklenen (bizim olan) task sayısı. */
  enqueued: number;
}

/**
 * `rank-poll` (ARCHITECTURE §9.3 adım 2), 2 dakikada bir. Önce 24 saattir
 * açık kalan task'lar `failed` yapılır; sonra `tasks_ready` ile hazır
 * task'lar bulunup `ready`'e çekilir ve her biri için `rank-fetch` eklenir
 * (jobId DataForSEO task id'sinden). Sistem job'udur; `rank-fetch` job'ları
 * task'ın org'uyla eklenir.
 */
@Injectable()
export class RankPollService {
  private readonly logger = new Logger(RankPollService.name);

  constructor(
    private readonly store: RankStore,
    private readonly dataForSeoClient: DataForSeoClient,
    private readonly dayCompletion: RankDayCompletion,
    private readonly cls: ClsService<AppClsStore>,
    @InjectQueue(QueueName.RankFetch)
    private readonly fetchQueue: Queue<RankFetchJobData>,
  ) {}

  async poll(now: Date = new Date()): Promise<RankPollStats> {
    const staleDays = await this.store.systemFailStale(
      new Date(now.getTime() - STALE_RANK_TASK_HOURS * HOUR_MS),
      `${STALE_RANK_TASK_HOURS} saat içinde hazır olmadı`,
    );
    for (const day of staleDays) {
      await runInTenant(this.cls, day.orgId, () =>
        this.dayCompletion.checkCompleted(
          day.orgId,
          day.projectId,
          day.checkDate,
        ),
      );
    }

    const ready = await this.dataForSeoClient.serpTasksReady();
    const tasks = await this.store.systemMarkReady(ready.map((t) => t.id));
    if (tasks.length > 0) {
      await this.fetchQueue.addBulk(
        tasks.map((task) => ({
          name: QueueName.RankFetch,
          data: {
            kind: 'task' as const,
            orgId: task.orgId,
            projectId: task.projectId,
            rankTaskId: task.id,
            trigger: JobTrigger.System,
          },
          opts: { jobId: rankFetchJobId(task.projectId, task.providerTaskId) },
        })),
      );
    }

    const stats: RankPollStats = {
      staleDays: staleDays.length,
      ready: ready.length,
      enqueued: tasks.length,
    };
    if (stats.staleDays > 0 || stats.enqueued > 0) {
      this.logger.log(
        `rank-poll: stale=${stats.staleDays} ready=${stats.ready} enqueued=${stats.enqueued}`,
      );
    }
    return stats;
  }
}
