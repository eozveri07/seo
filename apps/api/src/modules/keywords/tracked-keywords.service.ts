import { Injectable } from '@nestjs/common';
import { QueryDeepPartialEntity, QueryFailedError } from 'typeorm';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { ProjectsService } from '../clients/projects.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ListTrackedKeywordQueryDto } from './dto/list-tracked-keyword-query.dto';
import {
  TrackedKeyword,
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from './entities/tracked-keyword.entity';
import { KeywordGroupsService } from './keyword-groups.service';
import { resolveLocationLanguage } from './keyword-location-defaults';
import { KeywordVolumeJobsService } from './keyword-volume-jobs.service';
import { normalizeKeyword } from './normalize-keyword';
import {
  TrackedKeywordAlreadyExistsError,
  TrackedKeywordNotFoundError,
} from './keywords.errors';

const UNIQUE_CONSTRAINT =
  'UQ_tracked_keywords_project_id_normalized_device_location_language';

export interface CreateTrackedKeywordInput {
  projectId: string;
  keyword: string;
  groupId?: string;
  device?: TrackedKeywordDevice;
  locationCode?: number;
  languageCode?: string;
  frequency?: TrackedKeywordFrequency;
  targetUrl?: string;
  tags?: string[];
}

export interface UpdateTrackedKeywordInput {
  groupId?: string | null;
  frequency?: TrackedKeywordFrequency;
  targetUrl?: string | null;
  tags?: string[];
  isActive?: boolean;
}

/** Takip edilen keyword CRUD'u (ARCHITECTURE §5.5). */
@Injectable()
export class TrackedKeywordsService {
  constructor(
    @InjectTenantRepository(TrackedKeyword)
    private readonly keywords: TenantRepository<TrackedKeyword>,
    private readonly projectsService: ProjectsService,
    private readonly keywordGroups: KeywordGroupsService,
    private readonly keywordVolumeJobs: KeywordVolumeJobsService,
    private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: ListTrackedKeywordQueryDto,
  ): Promise<Page<TrackedKeyword>> {
    const qb = this.keywords
      .createQueryBuilder('keyword')
      .andWhere('keyword.project_id = :projectId', { projectId })
      .orderBy('keyword.keyword', 'ASC')
      .addOrderBy('keyword.id', 'ASC')
      .skip(pageOffset(query))
      .take(query.limit);
    if (query.search) {
      qb.andWhere('keyword.keyword ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.groupId) {
      qb.andWhere('keyword.group_id = :groupId', { groupId: query.groupId });
    }
    if (query.device) {
      qb.andWhere('keyword.device = :device', { device: query.device });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('keyword.is_active = :isActive', {
        isActive: query.isActive,
      });
    }
    if (query.tag) {
      qb.andWhere(':tag = ANY(keyword.tags)', { tag: query.tag });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(projectId: string, id: string): Promise<TrackedKeyword> {
    const keyword = await this.keywords.findOneBy({ id, projectId });
    if (!keyword) {
      throw new TrackedKeywordNotFoundError();
    }
    return keyword;
  }

  async create(
    orgId: string,
    input: CreateTrackedKeywordInput,
  ): Promise<TrackedKeyword> {
    const project = await this.projectsService.findOne(input.projectId);
    if (input.groupId) {
      await this.keywordGroups.findOne(input.projectId, input.groupId);
    }
    const { locationCode, languageCode } = resolveLocationLanguage(project, {
      locationCode: input.locationCode,
      languageCode: input.languageCode,
    });

    let keyword: TrackedKeyword;
    try {
      keyword = await this.keywords.save({
        projectId: input.projectId,
        groupId: input.groupId ?? null,
        keyword: input.keyword.trim(),
        keywordNormalized: normalizeKeyword(input.keyword),
        device: input.device ?? TrackedKeywordDevice.Desktop,
        locationCode,
        languageCode,
        frequency: input.frequency ?? TrackedKeywordFrequency.Daily,
        targetUrl: input.targetUrl ?? null,
        tags: input.tags ?? [],
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TrackedKeywordAlreadyExistsError();
      }
      throw error;
    }
    await this.audit.record({
      action: AuditAction.KeywordCreated,
      entityType: 'tracked_keyword',
      entityId: keyword.id,
      changes: { projectId: keyword.projectId, keyword: keyword.keyword },
    });
    await this.keywordVolumeJobs.enqueueManual(orgId, input.projectId);
    return keyword;
  }

  async update(
    projectId: string,
    id: string,
    input: UpdateTrackedKeywordInput,
  ): Promise<TrackedKeyword> {
    const keyword = await this.findOne(projectId, id);
    if (input.groupId) {
      await this.keywordGroups.findOne(projectId, input.groupId);
    }
    const patch: Partial<TrackedKeyword> = {};
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    if (input.frequency !== undefined) patch.frequency = input.frequency;
    if (input.targetUrl !== undefined) patch.targetUrl = input.targetUrl;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (Object.keys(patch).length === 0) {
      return keyword;
    }
    await this.keywords.update(
      { id },
      patch as QueryDeepPartialEntity<TrackedKeyword>,
    );
    return Object.assign(keyword, patch);
  }

  async delete(projectId: string, id: string): Promise<void> {
    const keyword = await this.findOne(projectId, id);
    await this.keywords.delete({ id: keyword.id });
    await this.audit.record({
      action: AuditAction.KeywordDeleted,
      entityType: 'tracked_keyword',
      entityId: keyword.id,
      changes: { projectId, keyword: keyword.keyword },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string } | undefined)?.constraint ===
      UNIQUE_CONSTRAINT
  );
}
