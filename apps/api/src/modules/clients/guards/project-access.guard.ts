import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { OrgRole } from '../../../common/tenancy/org-role';
import { TenantRequest } from '../../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../../common/tenancy/tenant.repository';
import { ProjectNotFoundError } from '../clients.errors';
import { Project } from '../entities/project.entity';

/**
 * Global guard, RolesGuard'dan sonra çalışır (ARCHITECTURE §4.3): `:projectId`
 * içeren route'larda projenin aktif org'a ait olduğunu ve `client_viewer` ise
 * kendi client'ında olduğunu doğrular. Proje yoksa ya da org/client dışındaysa
 * varlığı sızdırmamak için 404 döner (403 değil).
 *
 * `:projectId` içermeyen route'larda hiçbir şey yapmaz.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    @InjectTenantRepository(Project)
    private readonly projects: TenantRepository<Project>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const projectId = request.params?.projectId as string | undefined;
    if (!projectId) {
      return true;
    }
    if (!isUUID(projectId)) {
      throw new ProjectNotFoundError();
    }

    const project = await this.projects.findOneBy({ id: projectId });
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (
      request.tenant?.role === OrgRole.ClientViewer &&
      project.clientId !== request.tenant.clientId
    ) {
      throw new ProjectNotFoundError();
    }
    return true;
  }
}
