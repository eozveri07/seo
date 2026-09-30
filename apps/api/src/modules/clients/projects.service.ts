import { Injectable } from '@nestjs/common';
import { QueryDeepPartialEntity, QueryFailedError } from 'typeorm';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { OrgRole } from '../../common/tenancy/org-role';
import { TenantContext } from '../../common/tenancy/tenant-context';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import {
  InvalidProjectClientError,
  ProjectDomainTakenError,
  ProjectNotFoundError,
} from './clients.errors';
import { normalizeDomain } from './domain';
import { ListProjectQueryDto } from './dto/list-project-query.dto';
import { Client } from './entities/client.entity';
import { Project, ProjectStatus } from './entities/project.entity';

const DOMAIN_UNIQUE_CONSTRAINT = 'UQ_projects_org_id_domain';

export interface CreateProjectInput {
  clientId: string;
  name: string;
  domain: string;
  countryCode?: string;
  languageCode?: string;
  dfsLocationCode?: number;
  dfsLanguageCode?: string;
  timezone?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  clientId?: string;
  name?: string;
  domain?: string;
  countryCode?: string;
  languageCode?: string;
  dfsLocationCode?: number;
  dfsLanguageCode?: string;
  timezone?: string;
  status?: ProjectStatus;
}

/**
 * Proje CRUD'u (ARCHITECTURE §5.2). Erişim `TenantRepository` üzerinden org
 * kapsamlıdır; `ProjectAccessGuard` `:projectId` route'larında ayrıca
 * `client_viewer` scope'unu doğrular. Listede aynı scope burada uygulanır.
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectTenantRepository(Project)
    private readonly projects: TenantRepository<Project>,
    @InjectTenantRepository(Client)
    private readonly clients: TenantRepository<Client>,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListProjectQueryDto,
    actor: TenantContext,
  ): Promise<Page<Project>> {
    const qb = this.projects
      .createQueryBuilder('project')
      .orderBy('project.name', 'ASC')
      .addOrderBy('project.id', 'ASC')
      .skip(pageOffset(query))
      .take(query.limit);

    if (actor.role === OrgRole.ClientViewer) {
      qb.andWhere('project.client_id = :clientId', {
        clientId: actor.clientId,
      });
    } else if (query.clientId) {
      qb.andWhere('project.client_id = :clientId', {
        clientId: query.clientId,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(project.name ILIKE :search OR project.domain ILIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  /** `ProjectAccessGuard` zaten org ve client_viewer scope'unu doğruladı. */
  async findOne(id: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (!project) {
      throw new ProjectNotFoundError();
    }
    return project;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    await this.assertClientExists(input.clientId);
    const domain = normalizeDomain(input.domain);
    try {
      const project = await this.projects.save({
        clientId: input.clientId,
        name: input.name.trim(),
        domain,
        countryCode: input.countryCode ?? null,
        languageCode: input.languageCode ?? null,
        dfsLocationCode: input.dfsLocationCode ?? null,
        dfsLanguageCode: input.dfsLanguageCode ?? null,
        timezone: input.timezone ?? null,
        status: input.status ?? ProjectStatus.Active,
      });
      await this.audit.record({
        action: AuditAction.ProjectCreated,
        entityType: 'project',
        entityId: project.id,
        changes: { name: project.name, domain: project.domain },
      });
      return project;
    } catch (error) {
      if (isDomainConflict(error)) {
        throw new ProjectDomainTakenError();
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (!project) {
      throw new ProjectNotFoundError();
    }
    if (input.clientId !== undefined) {
      await this.assertClientExists(input.clientId);
    }

    const patch: Partial<Project> = {};
    if (input.clientId !== undefined) patch.clientId = input.clientId;
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.domain !== undefined)
      patch.domain = normalizeDomain(input.domain);
    if (input.countryCode !== undefined) patch.countryCode = input.countryCode;
    if (input.languageCode !== undefined)
      patch.languageCode = input.languageCode;
    if (input.dfsLocationCode !== undefined)
      patch.dfsLocationCode = input.dfsLocationCode;
    if (input.dfsLanguageCode !== undefined)
      patch.dfsLanguageCode = input.dfsLanguageCode;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.status !== undefined) patch.status = input.status;

    try {
      // client ilişkisi TypeORM'un derin partial tipine uymuyor; yalnız clientId yazılır.
      await this.projects.update(
        { id },
        patch as QueryDeepPartialEntity<Project>,
      );
    } catch (error) {
      if (isDomainConflict(error)) {
        throw new ProjectDomainTakenError();
      }
      throw error;
    }
    return Object.assign(project, patch);
  }

  async delete(id: string): Promise<void> {
    const project = await this.projects.findOneBy({ id });
    if (!project) {
      throw new ProjectNotFoundError();
    }
    await this.projects.delete({ id });
    await this.audit.record({
      action: AuditAction.ProjectDeleted,
      entityType: 'project',
      entityId: id,
      changes: { name: project.name, domain: project.domain },
    });
  }

  private async assertClientExists(clientId: string): Promise<void> {
    const exists = await this.clients.existsBy({ id: clientId });
    if (!exists) {
      throw new InvalidProjectClientError();
    }
  }
}

function isDomainConflict(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint ===
      DOMAIN_UNIQUE_CONSTRAINT
  );
}
