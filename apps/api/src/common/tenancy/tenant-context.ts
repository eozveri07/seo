import type { AuthenticatedRequest } from '../auth/current-user.decorator';
import { OrgRole } from './org-role';

/** TenantGuard'ın doğruladığı aktif organizasyon ve kullanıcının oradaki rolü. */
export interface TenantContext {
  orgId: string;
  role: OrgRole;
  /** client_viewer ise görebildiği tek client; diğer rollerde null. */
  clientId: string | null;
}

export type TenantRequest = AuthenticatedRequest & { tenant?: TenantContext };

/** Aktif organizasyonun geldiği tek yer (CLAUDE.md kural 4). */
export const ORG_ID_HEADER = 'x-org-id';

/** Swagger'daki güvenlik şeması adı; header'ı orval mutator'ı ekler. */
export const ORG_ID_SECURITY = 'org';
