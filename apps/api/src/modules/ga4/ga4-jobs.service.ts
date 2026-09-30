import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { addDays, addMonths, dateRange } from '../../common/dates/utc-date';
import {
  ga4BackfillJobId,
  ga4SyncJobId,
  ga4SyncManualJobId,
} from '../../infra/queue/job-ids';
import {
  Ga4SyncJobData,
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
import { Ga4ConnectionNotActiveError } from './ga4.errors';

/** ARCHITECTURE §9.2: GA4 backfill'i 14 ay geriye gider. */
export const GA4_BACKFILL_MONTHS = 14;

/** BullMQ job adı: `ga4-sync` kuyruğunda backfill günlerini ayırt eder. */
export const GA4_BACKFILL_JOB_NAME = 'ga4-backfill';

export interface Ga4BackfillPlan {
  from: string;
  to: string;
  total: number;
}

/**
 * GA4 job'larını kuyruğa ekler: günlük dispatch, manuel tetikleme ve
 * backfill. T1.5'teki `GscJobsService` kalıbını izler; ARCHITECTURE §7'de
 * GA4 için ayrı bir backfill kuyruğu tanımlı olmadığından hepsi `ga4-sync`
 * kuyruğunu paylaşır, backfill günleri ayrı bir job adı ve deterministik
 * jobId önekiyle ayrılır.
 */
@Injectable()
export class Ga4JobsService implements DailyDispatchSource {
  private readonly logger = new Logger(Ga4JobsService.name);

  constructor(
    @InjectQueue(QueueName.Ga4Sync)
    private readonly syncQueue: Queue<Ga4SyncJobData>,
    private readonly connectionsService: ConnectionsService,
    private readonly jobRuns: JobRunsService,
  ) {}

  /** `daily-dispatch`: aktif GA4 bağlantısı olan her aktif proje için bir sync. */
  async collect(date: string): Promise<DispatchItem[]> {
    const connections = await this.connectionsService.listActiveForDispatch(
      ConnectionType.Ga4,
    );
    return connections.map(({ orgId, projectId }) => ({
      orgId,
      projectId,
      kind: QueueName.Ga4Sync,
      enqueue: async () => {
        await this.syncQueue.add(
          QueueName.Ga4Sync,
          { orgId, projectId, date, trigger: JobTrigger.Schedule },
          {
            jobId: ga4SyncJobId(projectId, date),
            priority: JOB_PRIORITY.daily,
          },
        );
      },
    }));
  }

  /**
   * `POST /projects/:id/sync/ga4` (CLAUDE.md kural 6): `job_runs` kaydı
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
      ConnectionType.Ga4,
    );
    if (!connection || connection.status !== ConnectionStatus.Active) {
      throw new Ga4ConnectionNotActiveError();
    }

    const run = await this.jobRuns.createQueued({
      type: QueueName.Ga4Sync,
      projectId,
      trigger: JobTrigger.Manual,
    });
    const jobId = ga4SyncManualJobId(projectId, run.id);
    try {
      await this.syncQueue.add(
        QueueName.Ga4Sync,
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
          queueName: QueueName.Ga4Sync,
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
   * `connection.activated`: 14 ay geriye gün gün backfill job'ları düşük
   * öncelikle eklenir, en yeni gün önce. Backfill zaten bittiyse (`done`)
   * tekrar başlamaz. T1.5'teki `GscJobsService.startBackfill` kalıbı.
   */
  async startBackfill(
    orgId: string,
    projectId: string,
    today: string,
  ): Promise<Ga4BackfillPlan | null> {
    const connection = await this.connectionsService.findByProjectAndType(
      projectId,
      ConnectionType.Ga4,
    );
    if (
      !connection ||
      connection.status !== ConnectionStatus.Active ||
      connection.backfillStatus === ConnectionBackfillStatus.Done
    ) {
      return null;
    }

    const to = addDays(today, -1);
    const from = addMonths(today, -GA4_BACKFILL_MONTHS);
    const dates = dateRange(from, to).reverse();
    const plan: Ga4BackfillPlan = { from, to, total: dates.length };

    if (connection.backfillStatus !== ConnectionBackfillStatus.Pending) {
      await this.removeBackfillJobs(projectId, dates);
    }
    await this.connectionsService.startBackfill(connection.id, {
      ...plan,
      done: 0,
    });
    await this.syncQueue.addBulk(
      dates.map((date) => ({
        name: GA4_BACKFILL_JOB_NAME,
        data: { orgId, projectId, date, trigger: JobTrigger.System },
        opts: {
          jobId: ga4BackfillJobId(projectId, date),
          priority: JOB_PRIORITY.backfill,
        },
      })),
    );
    this.logger.log(
      `GA4 backfill başladı: orgId=${orgId} projectId=${projectId} ${from}..${to} (${dates.length} gün)`,
    );
    return plan;
  }

  private async removeBackfillJobs(
    projectId: string,
    dates: string[],
  ): Promise<void> {
    await Promise.all(
      dates.map((date) =>
        this.syncQueue.remove(ga4BackfillJobId(projectId, date)).catch(() => 0),
      ),
    );
  }
}
