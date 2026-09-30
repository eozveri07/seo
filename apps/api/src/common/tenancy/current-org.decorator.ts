import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext, TenantRequest } from './tenant-context';
import { TenantContextMissingError } from './tenant.errors';

/** TenantGuard'ın doğruladığı aktif organizasyon. `@SkipTenant()` handler'larda kullanılmaz. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<TenantRequest>();
    if (!request.tenant) {
      throw new TenantContextMissingError();
    }
    return request.tenant;
  },
);
