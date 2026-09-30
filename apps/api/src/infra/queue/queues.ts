import { JobsOptions } from 'bullmq';

/**
 * ARCHITECTURE.md §7'deki kuyruk listesi. Kuyruk isimleri ve job data
 * tipleri burada tek yerde tanımlanır; başka yerde string literal kuyruk
 * adı kullanılmaz.
 */
export enum QueueName {
  Dispatch = 'dispatch',
  GscSync = 'gsc-sync',
  GscBackfill = 'gsc-backfill',
  Ga4Sync = 'ga4-sync',
  RankPost = 'rank-post',
  RankPoll = 'rank-poll',
  RankFetch = 'rank-fetch',
  Summary = 'summary',
  AlertEval = 'alert-eval',
  Notify = 'notify',
  Report = 'report',
}

/** `job_runs.trigger` (ARCHITECTURE §5.6): job'u kim başlattı. */
export enum JobTrigger {
  Schedule = 'schedule',
  Manual = 'manual',
  System = 'system',
}

/** CLAUDE.md kural 4: job data'da tenant her zaman taşınır. */
export interface BaseJobData {
  orgId: string;
  projectId?: string;
  /**
   * `job_runs` kaydının id'si. Manuel tetiklemede API önceden `queued` bir
   * kayıt açıp buraya yazar; yoksa `BaseProcessor` ilk denemede açar ve
   * yeniden denemeler aynı kaydı kullanır.
   */
  runId?: string;
  /** Yoksa `schedule` varsayılır. */
  trigger?: JobTrigger;
}

/**
 * Sistem job'u: tüm org'ları dolaşır, bu yüzden `orgId` taşımaz ve
 * `BaseProcessor`'dan türemez. Job Scheduler şablonu sabit olduğu için gün
 * işlendiği anda belirlenir; `date` yalnız elle tetiklemede verilir.
 */
export interface DispatchJobData {
  /** YYYY-MM-DD (UTC). */
  date?: string;
}

export interface GscSyncJobData extends BaseJobData {
  projectId: string;
  /** Sync'in bitiş günü, YYYY-MM-DD (UTC); son 5 gün buna göre hesaplanır. */
  date: string;
}

export interface GscBackfillJobData extends BaseJobData {
  projectId: string;
  /** Çekilecek tek gün, YYYY-MM-DD. */
  date: string;
}

export interface Ga4SyncJobData extends BaseJobData {
  projectId: string;
  date?: string;
}

export interface RankPostJobData extends BaseJobData {
  projectId: string;
  keywordIds?: string[];
}

export interface RankPollJobData extends BaseJobData {
  rankTaskId?: string;
}

export interface RankFetchJobData extends BaseJobData {
  projectId: string;
  rankTaskId: string;
}

export interface SummaryJobData extends BaseJobData {
  projectId: string;
  date?: string;
}

export interface AlertEvalJobData extends BaseJobData {
  projectId: string;
}

export interface NotifyJobData extends BaseJobData {
  channelId: string;
}

export interface ReportJobData extends BaseJobData {
  projectId: string;
  reportId: string;
}

export interface QueueJobDataMap {
  [QueueName.Dispatch]: DispatchJobData;
  [QueueName.GscSync]: GscSyncJobData;
  [QueueName.GscBackfill]: GscBackfillJobData;
  [QueueName.Ga4Sync]: Ga4SyncJobData;
  [QueueName.RankPost]: RankPostJobData;
  [QueueName.RankPoll]: RankPollJobData;
  [QueueName.RankFetch]: RankFetchJobData;
  [QueueName.Summary]: SummaryJobData;
  [QueueName.AlertEval]: AlertEvalJobData;
  [QueueName.Notify]: NotifyJobData;
  [QueueName.Report]: ReportJobData;
}

/** Tenant job'u taşıyan kuyruklar (`BaseProcessor`); `dispatch` sistem job'udur. */
export type TenantQueueName = Exclude<QueueName, QueueName.Dispatch>;

/** ARCHITECTURE §7: tamamlanan job'lar 1 gün/1000 adet, başarısızlar 7 gün tutulur. */
export const DEFAULT_REMOVE_ON_COMPLETE = { age: 86400, count: 1000 };
export const DEFAULT_REMOVE_ON_FAIL = { age: 604800 };

export interface QueueRateLimiter {
  max: number;
  duration: number;
}

export interface QueueDefinition {
  name: QueueName;
  /** Worker'da processor'ın concurrency ayarı. */
  concurrency: number;
  /** Dış API kotasına uyan global rate limit; yoksa limitsiz. */
  limiter?: QueueRateLimiter;
  defaultJobOptions: JobsOptions;
}

function jobOptions(attempts: number, backoffDelayMs: number): JobsOptions {
  return {
    attempts,
    backoff: { type: 'exponential', delay: backoffDelayMs },
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL,
  };
}

/**
 * ARCHITECTURE §7 tablosundaki concurrency, limiter ve retry değerleri.
 * Tabloda backoff gecikmesi verilmeyen kuyruklar için 5 sn varsayılır
 * (gsc-sync'in belirtilen 30 sn'si dışında).
 */
export const QUEUE_DEFINITIONS: Record<QueueName, QueueDefinition> = {
  [QueueName.Dispatch]: {
    name: QueueName.Dispatch,
    concurrency: 1,
    defaultJobOptions: jobOptions(3, 5000),
  },
  [QueueName.GscSync]: {
    name: QueueName.GscSync,
    concurrency: 4,
    limiter: { max: 10, duration: 1000 },
    defaultJobOptions: jobOptions(5, 30000),
  },
  [QueueName.GscBackfill]: {
    name: QueueName.GscBackfill,
    concurrency: 2,
    // gsc-sync ile aynı client (Google service account) kotasını paylaşır.
    limiter: { max: 10, duration: 1000 },
    defaultJobOptions: jobOptions(5, 30000),
  },
  [QueueName.Ga4Sync]: {
    name: QueueName.Ga4Sync,
    concurrency: 4,
    limiter: { max: 5, duration: 1000 },
    defaultJobOptions: jobOptions(5, 5000),
  },
  [QueueName.RankPost]: {
    name: QueueName.RankPost,
    concurrency: 2,
    defaultJobOptions: jobOptions(3, 5000),
  },
  [QueueName.RankPoll]: {
    name: QueueName.RankPoll,
    concurrency: 1,
    defaultJobOptions: jobOptions(3, 5000),
  },
  [QueueName.RankFetch]: {
    name: QueueName.RankFetch,
    concurrency: 8,
    limiter: { max: 20, duration: 1000 },
    defaultJobOptions: jobOptions(5, 5000),
  },
  [QueueName.Summary]: {
    name: QueueName.Summary,
    concurrency: 4,
    defaultJobOptions: jobOptions(3, 5000),
  },
  [QueueName.AlertEval]: {
    name: QueueName.AlertEval,
    concurrency: 4,
    defaultJobOptions: jobOptions(3, 5000),
  },
  [QueueName.Notify]: {
    name: QueueName.Notify,
    concurrency: 4,
    defaultJobOptions: jobOptions(5, 5000),
  },
  [QueueName.Report]: {
    name: QueueName.Report,
    concurrency: 2,
    defaultJobOptions: jobOptions(2, 5000),
  },
};

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QueueName);

/**
 * ARCHITECTURE §7 tenant adaleti: günlük sync'ler yüksek, backfill düşük
 * öncelikle eklenir (BullMQ'da küçük sayı önce işlenir).
 */
export const JOB_PRIORITY = {
  daily: 1,
  backfill: 10,
} as const;
