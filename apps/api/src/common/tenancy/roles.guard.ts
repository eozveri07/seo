import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from './org-role';
import { ROLES_KEY } from './roles.decorator';
import { TenantRequest } from './tenant-context';
import { InsufficientRoleError } from './tenant.errors';

/**
 * Global guard, TenantGuard'dan sonra çalışır (ARCHITECTURE §4.3):
 * `@Roles(...)` varsa TenantGuard'ın yazdığı rolü kontrol eder. Tenant
 * context'i yoksa (ör. yanlışlıkla `@SkipTenant()` ile birlikte kullanıldıysa)
 * erişim verilmez.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const roles = this.reflector.getAllAndOverride<
      readonly OrgRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const role = request.tenant?.role;
    if (!role || !roles.includes(role)) {
      throw new InsufficientRoleError();
    }
    return true;
  }
}
