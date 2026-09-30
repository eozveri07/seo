/** `sync.completed` event adı; `EventEmitter2` üzerinden yayılır. */
export const SYNC_COMPLETED_EVENT = 'sync.completed';

/**
 * Bir projenin günlük/manuel GSC ya da GA4 sync'i başarıyla bitti (backfill
 * değil). `date`, senkronize edilen en güncel gün (`to`); T1.10'daki
 * `summary` job'u bu event'le tetiklenir. Aynı gün birden fazla
 * yayılabilir; dinleyici idempotenttir (deterministik jobId).
 */
export class SyncCompletedEvent {
  constructor(
    public readonly orgId: string,
    public readonly projectId: string,
    /** YYYY-MM-DD (UTC): sync'in kapsadığı en güncel gün. */
    public readonly date: string,
    public readonly source: 'gsc' | 'ga4',
  ) {}
}
