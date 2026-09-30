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
  ReportDispatch = 'report-dispatch',
  KeywordVolume = 'keyword-volume',
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
  /**
   * Günlük/manuel sync: bitiş günü (son 3 gün buna göre hesaplanır).
   * Backfill (job adı `ga4-backfill`): çekilecek tek gün.
   */
  date: string;
}

/**
 * `rank-post` (ARCHITECTURE §9.3): `daily` dispatch günlük keyword'leri ve
 * son 7 günde sonucu olmayan haftalık keyword'leri, `weekly` dispatch tüm
 * haftalık keyword'leri gönderir.
 */
export type RankPostScope = 'daily' | 'weekly';

export interface RankPostJobData extends BaseJobData {
  projectId: string;
  /** Kontrol günü (`rank_tasks.check_date`), YYYY-MM-DD (UTC). */
  date: string;
  scope: RankPostScope;
}

/**
 * Sistem job'u: DataForSEO `tasks_ready` hesap genelidir, tek bir tenant'ı
 * yoktur. Bu yüzden `orgId` taşımaz ve `BaseProcessor`'dan türemez; eklediği
 * her `rank-fetch` job'u kendi org'uyla kaydedilir.
 */
export type RankPollJobData = Record<string, never>;

/** Standard queue task'ının sonucunu çeker (`rank-poll` ekler). */
export interface RankFetchTaskJobData extends BaseJobData {
  kind: 'task';
  projectId: string;
  rankTaskId: string;
}

/** Anlık kontrol (`check-now`): `live/advanced`, `source = dfs_live`. */
export interface RankLiveJobData extends BaseJobData {
  kind: 'live';
  projectId: string;
  trackedKeywordId: string;
  /** Sonucun yazılacağı gün, YYYY-MM-DD (UTC). */
  date: string;
}

export type RankFetchJobData = RankFetchTaskJobData | RankLiveJobData;

export interface SummaryJobData extends BaseJobData {
  projectId: string;
  date?: string;
}

export interface AlertEvalJobData extends BaseJobData {
  projectId: string;
}

export interface NotifyJobData extends BaseJobData {
  /** Alert bildirimlerinde zorunlu; rapor bildirimlerinde (`reportId`) kullanılmaz. */
  channelId?: string;
  /** T1.14: `alert-eval`'in yazdığı `alert_events.id`; `notify` job'u bunu okur. */
  alertEventId?: string;
  /**
   * T1.15: `report` processor'ının PDF'i hazırladığı rapor; verilmişse
   * `reports.sent_to` alıcılarına PDF ekli mail gönderilir.
   */
  reportId?: string;
}

export interface ReportJobData extends BaseJobData {
  projectId: string;
  reportId: string;
}

/**
 * `report-dispatch` (T1.15, ARCHITECTURE §12): saatlik sistem job'u, tüm
 * org'lardaki `report_schedules`'ı tarar. `dispatch` gibi tek bir tenant'ı
 * yoktur, `BaseProcessor`'dan türemez.
 */
export type ReportDispatchJobData = Record<string, never>;

/**
 * `keyword-volume` (PLAN T1.8): keyword eklendiğinde ve ayda bir (işlendiği
 * anda `volume_updated_at` 30 günden eski olan keyword'ler için) `search_volume`
 * ve `cpc`'yi DataForSEO'dan günceller.
 */
export interface KeywordVolumeJobData extends BaseJobData {
  projectId: string;
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
  [QueueName.ReportDispatch]: ReportDispatchJobData;
  [QueueName.KeywordVolume]: KeywordVolumeJobData;
}

/**
 * Tenant job'u taşıyan kuyruklar (`BaseProcessor`); `dispatch`, `rank-poll`
 * ve `report-dispatch` sistem job'larıdır.
 */
export type TenantQueueName = Exclude<
  QueueName,
  QueueName.Dispatch | QueueName.RankPoll | QueueName.ReportDispatch
>;

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
  [QueueName.ReportDispatch]: {
    name: QueueName.ReportDispatch,
    concurrency: 1,
    defaultJobOptions: jobOptions(3, 5000),
  },
  [QueueName.KeywordVolume]: {
    name: QueueName.KeywordVolume,
    concurrency: 2,
    // DataForSEO search_volume/live için global rate limit ile aynı sınır.
    limiter: { max: 10, duration: 1000 },
    defaultJobOptions: jobOptions(5, 30000),
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
