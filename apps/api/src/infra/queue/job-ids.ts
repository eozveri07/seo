/**
 * Deterministik jobId'ler (CLAUDE.md kural 7, ARCHITECTURE §8.1). Aynı proje
 * ve gün için aynı id üretildiğinden BullMQ aynı job'u ikinci kez eklemez.
 *
 * BullMQ özel id'lerde `:` yalnız tam üç parça varsa kabul eder
 * (`a:b:c`); bu yüzden her id üç parçalıdır.
 */
export function gscSyncJobId(projectId: string, date: string): string {
  return `gsc-sync:${projectId}:${date}`;
}

export function gscBackfillJobId(projectId: string, date: string): string {
  return `gsc-backfill:${projectId}:${date}`;
}

/**
 * Manuel tetikleme her istekte yeni bir çalıştırmadır: günlük id kullanılsaydı
 * o günün tamamlanmış job'u BullMQ'da durduğu sürece istek sessizce yok
 * sayılırdı. Yazma yine upsert olduğundan tekrar çalışmak veriyi bozmaz.
 */
export function gscSyncManualJobId(projectId: string, runId: string): string {
  return `gsc-sync-manual:${projectId}:${runId}`;
}

/**
 * ARCHITECTURE §7: GA4'ün ayrı bir backfill kuyruğu yok, `ga4-sync`
 * kuyruğunu paylaşır (§9.2 gün gün job'lardan bahsetmez, GSC'nin aksine).
 * Backfill günleri `ga4-backfill:` önekiyle, günlük/manuel sync
 * `ga4-sync:`/`ga4-sync-manual:` önekiyle ayrılır; aynı kuyrukta çakışmaz.
 */
export function ga4SyncJobId(projectId: string, date: string): string {
  return `ga4-sync:${projectId}:${date}`;
}

export function ga4SyncManualJobId(projectId: string, runId: string): string {
  return `ga4-sync-manual:${projectId}:${runId}`;
}

export function ga4BackfillJobId(projectId: string, date: string): string {
  return `ga4-backfill:${projectId}:${date}`;
}

/** `daily-dispatch`'in aylık hacim yenilemesi: proje başına günde bir job. */
export function keywordVolumeJobId(projectId: string, date: string): string {
  return `keyword-volume:${projectId}:${date}`;
}

/**
 * Keyword eklendiğinde anında tetiklenen hacim job'u: `gsc-sync-manual` gibi
 * her tetiklemede yeni bir çalıştırmadır, bu yüzden benzersiz bir id alır.
 */
export function keywordVolumeManualJobId(
  projectId: string,
  uniqueId: string,
): string {
  return `keyword-volume-manual:${projectId}:${uniqueId}`;
}

/**
 * `rank-post`: proje, gün ve kapsam başına tek job. Pazartesi `daily-dispatch`
 * ve `weekly-dispatch` aynı gün çalıştığı için kapsam önekte ayrılır; ikisi
 * aynı keyword'ü seçse bile `rank_tasks` unique kısıtı tek task açtırır.
 */
export function rankPostJobId(
  projectId: string,
  date: string,
  scope: 'daily' | 'weekly',
): string {
  return `rank-post-${scope}:${projectId}:${date}`;
}

/** `rank-fetch`: DataForSEO task id'si başına tek job (ARCHITECTURE §9.3). */
export function rankFetchJobId(
  projectId: string,
  providerTaskId: string,
): string {
  return `rank-fetch:${projectId}:${providerTaskId}`;
}

/** Anlık kontrol her istekte yeni bir çalıştırmadır (`gsc-sync-manual` gibi). */
export function rankLiveJobId(projectId: string, runId: string): string {
  return `rank-live:${projectId}:${runId}`;
}

/**
 * `summary` (T1.10): proje ve tarih başına tek job. `sync.completed` ve
 * `rank.day_completed` aynı gün birden fazla yayılabilir; deterministik
 * jobId bu tetiklemelerin tek job'a düşmesini sağlar (son çalışan kazanır).
 */
export function summaryJobId(projectId: string, date: string): string {
  return `summary:${projectId}:${date}`;
}

/**
 * `report` (T1.15): bir `reports` satırı başına tek PDF üretim job'u;
 * manuel oluşturma ve `report-dispatch` aynı fonksiyonu kullanır.
 */
export function reportJobId(reportId: string): string {
  return `report:${reportId}:pdf`;
}

/**
 * `report-dispatch`'in bir schedule'ı belirli bir dönem için tetiklemesi:
 * aynı schedule ve dönem için BullMQ ikinci job'u yok sayar (§8.1 idempotency).
 */
export function reportScheduleJobId(
  scheduleId: string,
  periodStart: string,
): string {
  return `report-sched:${scheduleId}:${periodStart}`;
}

/** Bir rapor hazır olduğunda alıcılara PDF ekli mail için `notify` job'u. */
export function reportNotifyJobId(reportId: string): string {
  return `report-notify:${reportId}:mail`;
}
