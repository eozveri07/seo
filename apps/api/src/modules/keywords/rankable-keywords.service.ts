import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { ProjectStatus } from '../clients/entities/project.entity';
import {
  TrackedKeyword,
  TrackedKeywordDevice,
  TrackedKeywordFrequency,
} from './entities/tracked-keyword.entity';
import { TrackedKeywordNotFoundError } from './keywords.errors';

/** Rank kontrolü için gereken keyword alanları (DataForSEO task parametreleri). */
export interface RankableKeyword {
  id: string;
  projectId: string;
  keyword: string;
  device: TrackedKeywordDevice;
  locationCode: number;
  languageCode: string;
  frequency: TrackedKeywordFrequency;
  depth: number;
}

export interface RankableProject {
  orgId: string;
  projectId: string;
}

/**
 * Rank tracking'in (rankings modülü) keyword'lere tek erişim noktası
 * (CLAUDE.md kural 1). Dispatch için org'lar arası proje listesi sistem
 * sorgusudur; keyword okumaları CLS'teki org ile kapsamlanır.
 */
@Injectable()
export class RankableKeywordsService {
  constructor(
    @InjectRepository(TrackedKeyword)
    private readonly systemKeywords: Repository<TrackedKeyword>,
    @InjectTenantRepository(TrackedKeyword)
    private readonly keywords: TenantRepository<TrackedKeyword>,
  ) {}

  /**
   * Verilen sıklıklarda aktif keyword'ü olan aktif projeler (org'a, sonra
   * projeye göre sıralı; round-robin `DispatchService`'te yapılır).
   */
  async listProjectsForRank(
    frequencies: TrackedKeywordFrequency[],
  ): Promise<RankableProject[]> {
    return this.systemKeywords
      .createQueryBuilder('keyword')
      .innerJoin('keyword.project', 'project')
      .select('keyword.org_id', 'orgId')
      .addSelect('keyword.project_id', 'projectId')
      .where('keyword.is_active = true')
      .andWhere('keyword.frequency IN (:...frequencies)', { frequencies })
      .andWhere('project.status = :projectStatus', {
        projectStatus: ProjectStatus.Active,
      })
      .groupBy('keyword.org_id')
      .addGroupBy('keyword.project_id')
      .orderBy('keyword.org_id', 'ASC')
      .addOrderBy('keyword.project_id', 'ASC')
      .getRawMany<RankableProject>();
  }

  /** Projenin verilen sıklıklardaki aktif keyword'leri. */
  async listActive(
    projectId: string,
    frequencies: TrackedKeywordFrequency[],
  ): Promise<RankableKeyword[]> {
    const rows = await this.keywords.find({
      where: frequencies.map((frequency) => ({
        projectId,
        isActive: true,
        frequency,
      })),
      order: { id: 'ASC' },
    });
    return rows.map(toRankable);
  }

  /** Anlık kontrol için tek keyword; pasif keyword de kontrol edilebilir. */
  async findOne(projectId: string, id: string): Promise<RankableKeyword> {
    const keyword = await this.keywords.findOneBy({ id, projectId });
    if (!keyword) {
      throw new TrackedKeywordNotFoundError();
    }
    return toRankable(keyword);
  }
}

function toRankable(keyword: TrackedKeyword): RankableKeyword {
  return {
    id: keyword.id,
    projectId: keyword.projectId,
    keyword: keyword.keyword,
    device: keyword.device,
    locationCode: keyword.locationCode,
    languageCode: keyword.languageCode,
    frequency: keyword.frequency,
    depth: keyword.depth,
  };
}
