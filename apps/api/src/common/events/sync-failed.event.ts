/** `sync.failed` event adı; `EventEmitter2` üzerinden yayılır. */
export const SYNC_FAILED_EVENT = 'sync.failed';

/**
 * Bir veri kaynağının sync'i kalıcı olarak başarısız oldu (ör. GSC 403:
 * service account'un yetkisi kaldırıldı). Bağlantı `error`'a çekilmiştir.
 * T1.14'teki `sync_failure` alert'i bu event'i dinler.
 */
export class SyncFailedEvent {
  constructor(
    public readonly orgId: string,
    public readonly projectId: string,
    public readonly connectionId: string,
    public readonly source: 'gsc' | 'ga4',
    public readonly reason: string,
  ) {}
}
