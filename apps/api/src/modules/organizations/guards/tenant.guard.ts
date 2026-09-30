import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { isUUID } from 'class-validator';
import { InvalidAccessTokenError } from '../../../common/auth/auth.errors';
import { IS_PUBLIC_KEY } from '../../../common/auth/public.decorator';
import { AppClsStore } from '../../../common/cls-store';
import { SKIP_TENANT_KEY } from '../../../common/tenancy/skip-tenant.decorator';
import {
  ORG_ID_HEADER,
  TenantRequest,
} from '../../../common/tenancy/tenant-context';
import {
  OrgAccessDeniedError,
  OrgIdRequiredError,
} from '../../../common/tenancy/tenant.errors';
import { MembershipsService } from '../memberships.service';

/**
 * Global guard, JwtAuthGuard'dan sonra çalışır (ARCHITECTURE §4.3).
 * Aktif organizasyon yalnız `X-Org-Id` header'ından okunur; body, query ya da
 * path'teki bir org id'ye bakılmaz (CLAUDE.md kural 4). Kullanıcının üyeliği
 * doğrulanır (Redis cache 60 sn), `orgId`, `role` ve `clientScope` CLS'e,
 * aynı bilgi `request.tenant`'a yazılır.
 *
 * `@Public()` ve `@SkipTenant()` handler'lar atlanır.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly memberships: MembershipsService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      ) ||
      this.reflector.getAllAndOverride<boolean | undefined>(
        SKIP_TENANT_KEY,
        targets,
      )
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user) {
      // JwtAuthGuard önce çalışmalı; çalışmadıysa erişim verilmez.
      throw new InvalidAccessTokenError();
    }

    const orgId = readOrgIdHeader(request);
    if (!orgId) {
      throw new OrgIdRequiredError();
    }
    if (!isUUID(orgId)) {
      throw new OrgAccessDeniedError();
    }

    const membership = await this.memberships.resolve(orgId, request.user.id);
    if (!membership) {
      throw new OrgAccessDeniedError();
    }

    request.tenant = {
      orgId,
      role: membership.role,
      clientId: membership.clientId,
    };
    this.cls.set('orgId', orgId);
    this.cls.set('role', membership.role);
    this.cls.set('clientScope', membership.clientId);
    return true;
  }
}

function readOrgIdHeader(request: TenantRequest): string | undefined {
  const header = request.headers[ORG_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}
