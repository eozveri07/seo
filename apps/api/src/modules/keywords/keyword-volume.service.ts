import { Injectable, Logger } from '@nestjs/common';
import { DataForSeoClient } from '../../connectors/dataforseo/dataforseo.client';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { VOLUME_STALE_AFTER_DAYS } from './keyword-volume-jobs.service';
import { TrackedKeyword } from './entities/tracked-keyword.entity';

/** DataForSEO `search_volume/live`'a istek başına en fazla bu kadar keyword. */
export const KEYWORD_VOLUME_BATCH_SIZE = 700;

export interface KeywordVolumeRefreshStats {
  projectId: string;
  checked: number;
  updated: number;
}

/**
 * `keyword-volume` kuyruğunun iş mantığı (PLAN T1.8, ARCHITECTURE §9.3).
 * Hacmi hiç güncellenmemiş ya da 30 günden eski, aktif keyword'leri
 * `(locationCode, languageCode)` gruplarına ayırıp `keywordSearchVolume` ile
 * günceller. Maliyet kaydı `DataForSeoClient` içinde yapılır.
 */
@Injectable()
export class KeywordVolumeService {
  private readonly logger = new Logger(KeywordVolumeService.name);

  constructor(
    @InjectTenantRepository(TrackedKeyword)
    private readonly keywords: TenantRepository<TrackedKeyword>,
    private readonly dataForSeoClient: DataForSeoClient,
  ) {}

  async refreshProject(
    orgId: string,
    projectId: string,
    jobRunId?: string,
  ): Promise<KeywordVolumeRefreshStats> {
    const threshold = new Date(
      Date.now() - VOLUME_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );
    const active = await this.keywords.find({
      where: { projectId, isActive: true },
    });
    const candidates = active.filter(
      (keyword) =>
        keyword.volumeUpdatedAt === null || keyword.volumeUpdatedAt < threshold,
    );
    if (candidates.length === 0) {
      return { projectId, checked: 0, updated: 0 };
    }

    let updated = 0;
    for (const group of groupByLocationLanguage(candidates)) {
      for (const batch of chunk(group.keywords, KEYWORD_VOLUME_BATCH_SIZE)) {
        const results = await this.dataForSeoClient.keywordSearchVolume(
          batch.map((keyword) => keyword.keywordNormalized),
          group.locationCode,
          group.languageCode,
          { orgId, projectId, jobRunId },
        );
        const byKeyword = new Map(
          results.map((result) => [result.keyword, result]),
        );
        const now = new Date();
        for (const keyword of batch) {
          const result = byKeyword.get(keyword.keywordNormalized);
          await this.keywords.update(
            { id: keyword.id },
            {
              searchVolume: result?.searchVolume ?? null,
              cpc: result?.cpc != null ? result.cpc.toFixed(2) : null,
              volumeUpdatedAt: now,
            },
          );
          updated += 1;
        }
      }
    }

    this.logger.log(
      `keyword-volume: orgId=${orgId} projectId=${projectId} checked=${candidates.length} updated=${updated}`,
    );
    return { projectId, checked: candidates.length, updated };
  }
}

interface LocationLanguageGroup {
  locationCode: number;
  languageCode: string;
  keywords: TrackedKeyword[];
}

function groupByLocationLanguage(
  keywords: TrackedKeyword[],
): LocationLanguageGroup[] {
  const groups = new Map<string, LocationLanguageGroup>();
  for (const keyword of keywords) {
    const key = `${keyword.locationCode}:${keyword.languageCode}`;
    const group = groups.get(key);
    if (group) {
      group.keywords.push(keyword);
    } else {
      groups.set(key, {
        locationCode: keyword.locationCode,
        languageCode: keyword.languageCode,
        keywords: [keyword],
      });
    }
  }
  return [...groups.values()];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
