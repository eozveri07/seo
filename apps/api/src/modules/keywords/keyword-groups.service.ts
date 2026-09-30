import { Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ListKeywordGroupQueryDto } from './dto/list-keyword-group-query.dto';
import { KeywordGroup } from './entities/keyword-group.entity';
import {
  KeywordGroupNameTakenError,
  KeywordGroupNotFoundError,
} from './keywords.errors';

const NAME_UNIQUE_CONSTRAINT = 'UQ_keyword_groups_project_id_name';

export interface CreateKeywordGroupInput {
  projectId: string;
  name: string;
  color?: string;
}

export interface UpdateKeywordGroupInput {
  name?: string;
  color?: string;
}

/** Keyword grubu CRUD'u (ARCHITECTURE §5.5). */
@Injectable()
export class KeywordGroupsService {
  constructor(
    @InjectTenantRepository(KeywordGroup)
    private readonly groups: TenantRepository<KeywordGroup>,
    private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: ListKeywordGroupQueryDto,
  ): Promise<Page<KeywordGroup>> {
    const qb = this.groups
      .createQueryBuilder('group')
      .andWhere('group.project_id = :projectId', { projectId })
      .orderBy('group.name', 'ASC')
      .addOrderBy('group.id', 'ASC')
      .skip(pageOffset(query))
      .take(query.limit);
    if (query.search) {
      qb.andWhere('group.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(projectId: string, id: string): Promise<KeywordGroup> {
    const group = await this.groups.findOneBy({ id, projectId });
    if (!group) {
      throw new KeywordGroupNotFoundError();
    }
    return group;
  }

  async create(input: CreateKeywordGroupInput): Promise<KeywordGroup> {
    const group = await this.save({
      projectId: input.projectId,
      name: input.name.trim(),
      color: input.color ?? null,
    });
    await this.audit.record({
      action: AuditAction.KeywordGroupCreated,
      entityType: 'keyword_group',
      entityId: group.id,
      changes: { projectId: group.projectId, name: group.name },
    });
    return group;
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateKeywordGroupInput,
  ): Promise<KeywordGroup> {
    const group = await this.findOne(projectId, id);
    const patch: Partial<KeywordGroup> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.color !== undefined) patch.color = input.color;
    if (Object.keys(patch).length === 0) {
      return group;
    }
    await this.save({ ...group, ...patch });
    return Object.assign(group, patch);
  }

  async delete(projectId: string, id: string): Promise<void> {
    const group = await this.findOne(projectId, id);
    await this.groups.delete({ id: group.id });
    await this.audit.record({
      action: AuditAction.KeywordGroupDeleted,
      entityType: 'keyword_group',
      entityId: group.id,
      changes: { projectId, name: group.name },
    });
  }

  private async save(
    entity: Partial<KeywordGroup> & { projectId: string; name: string },
  ): Promise<KeywordGroup> {
    try {
      return await this.groups.save(entity);
    } catch (error) {
      if (isUniqueViolation(error, NAME_UNIQUE_CONSTRAINT)) {
        throw new KeywordGroupNameTakenError();
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint ===
      constraint
  );
}
