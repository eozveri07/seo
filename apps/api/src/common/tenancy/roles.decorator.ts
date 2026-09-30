import { SetMetadata } from '@nestjs/common';
import { OrgRole } from './org-role';

export const ROLES_KEY = 'tenancy:roles';

/**
 * Handler'ı yalnız verilen rollere açar (RolesGuard). Roller §4.2'den
 * `ROLE_MATRIX` ile verilir. `@Roles` olmayan org kapsamlı endpoint'ler her
 * üyeye açıktır.
 */
export const Roles = (
  ...roles: readonly OrgRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
