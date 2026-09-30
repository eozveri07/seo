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
