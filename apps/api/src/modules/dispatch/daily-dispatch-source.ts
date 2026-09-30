/**
 * `daily-dispatch`'in kuyruğa ekleyeceği tek bir proje işi. `enqueue`
 * deterministik jobId ile ekler (CLAUDE.md kural 7), bu yüzden aynı gün
 * tekrar çağrılması iş çoğaltmaz.
 */
export interface DispatchItem {
  orgId: string;
  projectId: string;
  /** Log ve istatistik için, ör. `gsc-sync`. */
  kind: string;
  enqueue(): Promise<void>;
}

/**
 * Günlük dispatch'e katılan bir veri kaynağı (GSC; GA4 ve rank kendi
 * görevlerinde eklenir). Kaynaklar `DAILY_DISPATCH_SOURCES` token'ına
 * eklenerek genişletilir; round-robin sıralama `DispatchService`'tedir.
 */
export interface DailyDispatchSource {
  collect(date: string): Promise<DispatchItem[]>;
}

export const DAILY_DISPATCH_SOURCES = Symbol('DAILY_DISPATCH_SOURCES');
