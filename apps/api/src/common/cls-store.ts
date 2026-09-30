import { ClsStore } from 'nestjs-cls';

/**
 * Uygulamanın CLS içeriği. `ClsService<AppClsStore>` ile tip güvenli erişilir.
 */
export interface AppClsStore extends ClsStore {
  /** Aktif organizasyon. HTTP'de TenantGuard, job'larda processor set eder. */
  orgId?: string;
}
