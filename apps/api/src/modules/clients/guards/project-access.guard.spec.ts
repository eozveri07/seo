import { ExecutionContext } from '@nestjs/common';
import { OrgRole } from '../../../common/tenancy/org-role';
import { TenantRequest } from '../../../common/tenancy/tenant-context';
import { TenantRepository } from '../../../common/tenancy/tenant.repository';
import { ProjectNotFoundError } from '../clients.errors';
import { Project } from '../entities/project.entity';
import { ProjectAccessGuard } from './project-access.guard';

const PROJECT_ID = '0190f0e4-0000-7000-8000-00000000000b';
const CLIENT_ID = '0190f0e4-0000-7000-8000-00000000000c';
const OTHER_CLIENT_ID = '0190f0e4-0000-7000-8000-00000000000d';

function setup() {
  const projects = {
    findOneBy: jest.fn(),
  };
  const guard = new ProjectAccessGuard(
    projects as unknown as TenantRepository<Project>,
  );
  return { guard, projects };
}

function httpContext(request: Partial<TenantRequest>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requestWith(
  projectId: string | undefined,
  tenant?: TenantRequest['tenant'],
): TenantRequest {
  return {
    params: projectId ? { projectId } : {},
    tenant,
  } as unknown as TenantRequest;
}

describe('ProjectAccessGuard', () => {
  it(":projectId içermeyen route'larda dokunmaz", async () => {
    const { guard, projects } = setup();

    await expect(
      guard.canActivate(httpContext(requestWith(undefined))),
    ).resolves.toBe(true);
    expect(projects.findOneBy).not.toHaveBeenCalled();
  });

  it('UUID olmayan projectId 404 PROJECT_NOT_FOUND ve DB sorgulanmaz', async () => {
    const { guard, projects } = setup();

    await expect(
      guard.canActivate(httpContext(requestWith("1' OR 1=1"))),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect(projects.findOneBy).not.toHaveBeenCalled();
  });

  it("başka org'un projesinde (TenantRepository scope dışı) 404 döner", async () => {
    const { guard, projects } = setup();
    projects.findOneBy.mockResolvedValue(null);
    const req = requestWith(PROJECT_ID, {
      orgId: 'org-1',
      role: OrgRole.Admin,
      clientId: null,
    });

    await expect(guard.canActivate(httpContext(req))).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    expect(projects.findOneBy).toHaveBeenCalledWith({ id: PROJECT_ID });
  });

  it("client_viewer başka client'ın projesine erişirse 404 döner", async () => {
    const { guard, projects } = setup();
    projects.findOneBy.mockResolvedValue({
      id: PROJECT_ID,
      clientId: OTHER_CLIENT_ID,
    });
    const req = requestWith(PROJECT_ID, {
      orgId: 'org-1',
      role: OrgRole.ClientViewer,
      clientId: CLIENT_ID,
    });

    await expect(guard.canActivate(httpContext(req))).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it("client_viewer kendi client'ının projesine erişebilir", async () => {
    const { guard, projects } = setup();
    projects.findOneBy.mockResolvedValue({
      id: PROJECT_ID,
      clientId: CLIENT_ID,
    });
    const req = requestWith(PROJECT_ID, {
      orgId: 'org-1',
      role: OrgRole.ClientViewer,
      clientId: CLIENT_ID,
    });

    await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);
  });

  it("admin/analyst/owner org içindeki her client'ın projesine erişebilir", async () => {
    const { guard, projects } = setup();
    projects.findOneBy.mockResolvedValue({
      id: PROJECT_ID,
      clientId: OTHER_CLIENT_ID,
    });
    const req = requestWith(PROJECT_ID, {
      orgId: 'org-1',
      role: OrgRole.Admin,
      clientId: null,
    });

    await expect(guard.canActivate(httpContext(req))).resolves.toBe(true);
  });
});
