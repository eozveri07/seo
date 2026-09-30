/** `rank.day_completed` event adı; `EventEmitter2` üzerinden yayılır. */
export const RANK_DAY_COMPLETED_EVENT = 'rank.day_completed';

/**
 * Bir projenin o günkü tüm rank task'ları kapandı (`fetched` ya da
 * `failed`). T1.10'daki `summary` job'u bu event'le tetiklenir
 * (ARCHITECTURE §9.3 adım 4). Aynı gün birden fazla yayılabilir; dinleyici
 * idempotent olmalıdır.
 */
export class RankDayCompletedEvent {
  constructor(
    public readonly orgId: string,
    public readonly projectId: string,
    /** YYYY-MM-DD (UTC), `rank_tasks.check_date`. */
    public readonly date: string,
  ) {}
}
