import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { addDays, addMonths, dateRange } from '../../common/dates/utc-date';
import {
  gscBackfillJobId,
  gscSyncJobId,
  gscSyncManualJobId,
} from '../../infra/queue/job-ids';
import {
  GscBackfillJobData,
  GscSyncJobData,
  JOB_PRIORITY,
  JobTrigger,
  QueueName,
} from '../../infra/queue/queues';
import { ConnectionsService } from '../connections/connections.service';
import {
  ConnectionBackfillStatus,
  ConnectionStatus,
  ConnectionType,
} from '../connections/entities/connection.entity';
import {
  DailyDispatchSource,
  DispatchItem,
} from '../dispatch/daily-dispatch-source';
import { JobRunsService } from '../jobs/job-runs.service';
import { GscConnectionNotActiveError } from './gsc.errors';

/** ARCHITECTURE §9.1: GSC geçmişi 16 ay geriye gider. */
export const GSC_BACKFILL_MONTHS = 16;

export interface BackfillPlan {
  from: string;
  to: string;
  total: number;
}

/**
 * GSC job'larını kuyruğa ekler: günlük dispatch, manuel tetikleme ve
 * backfill. Hepsi deterministik jobId kullanır (`infra/queue/job-ids.ts`).
 */
@Injectable()
export class GscJobsService implements DailyDispatchSource {
  private readonly logger = new Logger(GscJobsService.name);

  constructor(
    @InjectQueue(QueueName.GscSync)
    private readonly syncQueue: Queue<GscSyncJobData>,
    @InjectQueue(QueueName.GscBackfill)
    private readonly backfillQueue: Queue<GscBackfillJobData>,
    private readonly connectionsService: ConnectionsService,
    private readonly jobRuns: JobRunsService,
  ) {}

  /** `daily-dispatch`: aktif GSC bağlantısı olan her aktif proje için bir sync. */
  async collect(date: string): Promise<DispatchItem[]> {
    const connections = await this.connectionsService.listActiveForDispatch(
      ConnectionType.Gsc,
    );
    return connections.map(({ orgId, projectId }) => ({
      orgId,
      projectId,
      kind: QueueName.GscSync,
      enqueue: async () => {
        await this.syncQueue.add(
          QueueName.GscSync,
          { orgId, projectId, date, trigger: JobTrigger.Schedule },
          {
            jobId: gscSyncJobId(projectId, date),
            priority: JOB_PRIORITY.daily,
          },
        );
      },
    }));
  }

  /**
   * `POST /projects/:id/sync/gsc` (CLAUDE.md kural 6): `job_runs` kaydı
   * `queued` açılır, job eklenir ve kaydın id'si döner. Kuyruğa eklenemezse
   * kayıt `failed` kapanır.
   */
  async triggerManualSync(
    orgId: string,
    projectId: string,
    today: string,
  ): Promise<string> {
    const connection = await this.connectionsService.findByProjectAndType(
      projectId,
      ConnectionType.Gsc,
    );
    if (!connection || connection.status !== ConnectionStatus.Active) {
      throw new GscConnectionNotActiveError();
    }

    const run = await this.jobRuns.createQueued({
      type: QueueName.GscSync,
      projectId,
      trigger: JobTrigger.Manual,
    });
    const jobId = gscSyncManualJobId(projectId, run.id);
    try {
      await this.syncQueue.add(
        QueueName.GscSync,
        {
          orgId,
          projectId,
          date: today,
          runId: run.id,
          trigger: JobTrigger.Manual,
        },
        { jobId, priority: JOB_PRIORITY.daily },
      );
    } catch (error) {
      await this.jobRuns.fail(
        {
          queueName: QueueName.GscSync,
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

  /**
   * `connection.activated`: 16 ay geriye gün gün backfill job'ları düşük
   * öncelikle eklenir, en yeni gün önce. Backfill zaten bittiyse
   * (`done`) tekrar başlamaz.
   *
   * Yeniden başlatmada (ör. 403 sonrası tekrar doğrulama) aynı jobId'ler
   * BullMQ'da tamamlanmış halde duruyor olabilir; `add` onları yok sayar ve
   * `done` sayacı `total`'a ulaşmaz. Bu yüzden önce eski job'lar silinir
   * (çalışmakta olan kilitli job silinemez, o da biterken sayılır).
   */
  async startBackfill(
    orgId: string,
    projectId: string,
    today: string,
  ): Promise<BackfillPlan | null> {
    const connection = await this.connectionsService.findByProjectAndType(
      projectId,
      ConnectionType.Gsc,
    );
    if (
      !connection ||
      connection.status !== ConnectionStatus.Active ||
      connection.backfillStatus === ConnectionBackfillStatus.Done
    ) {
      return null;
    }

    const to = addDays(today, -1);
    const from = addMonths(today, -GSC_BACKFILL_MONTHS);
    const dates = dateRange(from, to).reverse();
    const plan: BackfillPlan = { from, to, total: dates.length };

    if (connection.backfillStatus !== ConnectionBackfillStatus.Pending) {
      await this.removeBackfillJobs(projectId, dates);
    }
    await this.connectionsService.startBackfill(connection.id, {
      ...plan,
      done: 0,
    });
    await this.backfillQueue.addBulk(
      dates.map((date) => ({
        name: QueueName.GscBackfill,
        data: { orgId, projectId, date, trigger: JobTrigger.System },
        opts: {
          jobId: gscBackfillJobId(projectId, date),
          priority: JOB_PRIORITY.backfill,
        },
      })),
    );
    this.logger.log(
      `GSC backfill başladı: orgId=${orgId} projectId=${projectId} ${from}..${to} (${dates.length} gün)`,
    );
    return plan;
  }

  private async removeBackfillJobs(
    projectId: string,
    dates: string[],
  ): Promise<void> {
    await Promise.all(
      dates.map((date) =>
        this.backfillQueue
          .remove(gscBackfillJobId(projectId, date))
          .catch(() => 0),
      ),
    );
  }
}
