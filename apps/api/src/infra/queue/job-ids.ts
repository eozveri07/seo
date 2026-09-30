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
