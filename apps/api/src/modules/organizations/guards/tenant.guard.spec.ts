import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { InvalidAccessTokenError } from '../../../common/auth/auth.errors';
import { IS_PUBLIC_KEY } from '../../../common/auth/public.decorator';
import { AppClsStore } from '../../../common/cls-store';
import { OrgRole } from '../../../common/tenancy/org-role';
import { SKIP_TENANT_KEY } from '../../../common/tenancy/skip-tenant.decorator';
import { TenantRequest } from '../../../common/tenancy/tenant-context';
import {
  OrgAccessDeniedError,
  OrgIdRequiredError,
} from '../../../common/tenancy/tenant.errors';
import { MembershipsService } from '../memberships.service';
import { TenantGuard } from './tenant.guard';

const ORG_ID = '0190f0e4-0000-7000-8000-00000000000a';
const USER_ID = '0190f0e4-0000-7000-8000-0000000000a1';

function setup(metadata: Record<string, boolean> = {}) {
  const store: Partial<AppClsStore> = {};
  const cls = {
    set: jest.fn((key: string, value: unknown) => {
      (store as Record<string, unknown>)[key] = value;
    }),
  };
  const memberships = {
    resolve: jest
      .fn()
      .mockResolvedValue({ role: OrgRole.Analyst, clientId: null }),
  };
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  };
  const guard = new TenantGuard(
    reflector as unknown as Reflector,
    memberships as unknown as MembershipsService,
    cls as unknown as ClsService<AppClsStore>,
  );
  return { guard, memberships, store, cls };
}

function httpContext(request: Partial<TenantRequest>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function request(headers: Record<string, string | string[]> = {}) {
  return {
    user: { id: USER_ID },
    headers,
  } as unknown as TenantRequest;
}

describe('TenantGuard', () => {
  it("X-Org-Id'deki üyeliği doğrular; orgId, role ve clientScope'u CLS'e ve request'e yazar", async () => {
    const { guard, memberships, store } = setup();
    memberships.resolve.mockResolvedValue({
      role: OrgRole.ClientViewer,
      clientId: 'client-1',
    });
    const req = request({ 'x-org-id': ORG_ID.toUpperCase() });

    await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);

    expect(memberships.resolve).toHaveBeenCalledWith(ORG_ID, USER_ID);
    expect(store).toEqual({
      orgId: ORG_ID,
      role: OrgRole.ClientViewer,
      clientScope: 'client-1',
    });
    expect(req.tenant).toEqual({
      orgId: ORG_ID,
      role: OrgRole.ClientViewer,
      clientId: 'client-1',
    });
  });

  it('header yoksa ORG_ID_REQUIRED', async () => {
    const { guard, memberships } = setup();

    await expect(
      guard.canActivate(httpContext(request())),
    ).rejects.toBeInstanceOf(OrgIdRequiredError);
    expect(memberships.resolve).not.toHaveBeenCalled();
  });

  it('header UUID değilse ORG_ACCESS_DENIED ve DB/cache sorgulanmaz', async () => {
    const { guard, memberships } = setup();

    await expect(
      guard.canActivate(httpContext(request({ 'x-org-id': "1' OR 1=1" }))),
    ).rejects.toBeInstanceOf(OrgAccessDeniedError);
    expect(memberships.resolve).not.toHaveBeenCalled();
  });

  it('üye değilse ORG_ACCESS_DENIED ve CLS’e hiçbir şey yazılmaz', async () => {
    const { guard, memberships, cls } = setup();
    memberships.resolve.mockResolvedValue(undefined);
    const req = request({ 'x-org-id': ORG_ID });

    await expect(guard.canActivate(httpContext(req))).rejects.toBeInstanceOf(
      OrgAccessDeniedError,
    );
    expect(cls.set).not.toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
  });

  it('body ya da query’deki org id’ye bakmaz', async () => {
    const { guard, memberships } = setup();
    const req = {
      ...request(),
      body: { orgId: ORG_ID },
      query: { orgId: ORG_ID },
    } as unknown as TenantRequest;

    await expect(guard.canActivate(httpContext(req))).rejects.toBeInstanceOf(
      OrgIdRequiredError,
    );
    expect(memberships.resolve).not.toHaveBeenCalled();
  });

  it('JwtAuthGuard kullanıcıyı yazmadıysa 401', async () => {
    const { guard } = setup();
    const req = { headers: { 'x-org-id': ORG_ID } } as unknown as TenantRequest;

    await expect(guard.canActivate(httpContext(req))).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it.each([
    ['@Public()', IS_PUBLIC_KEY],
    ['@SkipTenant()', SKIP_TENANT_KEY],
  ])('%s handler’ları atlar', async (_name, key) => {
    const { guard, memberships } = setup({ [key]: true });

    await expect(guard.canActivate(httpContext(request()))).resolves.toBe(true);
    expect(memberships.resolve).not.toHaveBeenCalled();
  });
});
