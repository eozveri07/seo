import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_KEY = 'tenancy:skipTenant';

/**
 * Org seçimi gerektirmeyen oturumlu endpoint'ler için (`/me`, `/organizations`
 * listeleme ve oluşturma, davet kabulü): TenantGuard X-Org-Id istemez.
 */
export const SkipTenant = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_TENANT_KEY, true);
