import { ClsStore } from 'nestjs-cls';
import type { OrgRole } from './tenancy/org-role';

/**
 * Uygulamanın CLS içeriği. `ClsService<AppClsStore>` ile tip güvenli erişilir.
 */
export interface AppClsStore extends ClsStore {
  /** Aktif organizasyon. HTTP'de TenantGuard, job'larda processor set eder. */
  orgId?: string;
  /** Oturumdaki kullanıcı. HTTP'de JwtAuthGuard set eder. */
  userId?: string;
  /** Kullanıcının aktif organizasyondaki rolü. HTTP'de TenantGuard set eder. */
  role?: OrgRole;
  /** client_viewer'ın görebildiği tek client; diğer rollerde null. TenantGuard set eder. */
  clientScope?: string | null;
  /** İsteği yapan istemcinin IP'si (audit kayıtları için). */
  ip?: string;
}
