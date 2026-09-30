import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../cls-store';
import { TenantContextMissingError } from './tenant.errors';

/**
 * `TenantRepository` dışında (raw SQL) yapılan tenant sorguları için CLS'teki
 * orgId. Her raw sorgu bu değerle `org_id` filtresi kurar (CLAUDE.md kural 4).
 */
export function requireOrgId(cls: ClsService<AppClsStore>): string {
  const orgId = cls.isActive() ? cls.get('orgId') : undefined;
  if (!orgId) {
    throw new TenantContextMissingError();
  }
  return orgId;
}
