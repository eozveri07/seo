import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { addDays, todayUtc } from '../../common/dates/utc-date';
import { InjectTenantRepository } from '../../common/tenancy/tenant-repository.provider';
import { TenantRepository } from '../../common/tenancy/tenant.repository';
import { requireOrgId } from '../../common/tenancy/require-org-id';
import { KeywordSuggestionsQueryDto } from './dto/keyword-suggestions-query.dto';
import { KeywordSuggestionsResponseDto } from './dto/keyword-suggestion-response.dto';
import { TrackedKeyword } from './entities/tracked-keyword.entity';
import { normalizeKeyword } from './normalize-keyword';

/** ARCHITECTURE §5.5: öneriler son 28 günün gösterim toplamına göre sıralanır. */
export const SUGGESTIONS_RANGE_DAYS = 28;
/** Takipteki sorguları eledikten sonra `limit`'e ulaşmak için adaylar bu kat daha geniş çekilir. */
const CANDIDATE_MULTIPLIER = 5;

interface SuggestionRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * `GET /projects/:id/keywords/suggestions` (PLAN T1.8): son 28 günde
 * gösterimi yüksek, takipte olmayan GSC sorguları. Takipteki keyword'ler
 * `normalizeKeyword` ile aynı normalizasyonla karşılaştırılıp hariç
 * tutulur (SQL'de değil uygulamada: `keyword_normalized`'in tek üreticisi).
 */
@Injectable()
export class KeywordSuggestionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectTenantRepository(TrackedKeyword)
    private readonly trackedKeywords: TenantRepository<TrackedKeyword>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async suggestions(
    projectId: string,
    query: KeywordSuggestionsQueryDto,
    today: string = todayUtc(),
  ): Promise<KeywordSuggestionsResponseDto> {
    const orgId = requireOrgId(this.cls);
    const to = addDays(today, -1);
    const from = addDays(to, -(SUGGESTIONS_RANGE_DAYS - 1));

    const [candidates, tracked] = await Promise.all([
      this.dataSource.query<SuggestionRow[]>(
        `SELECT g.query AS "query",
                SUM(g.clicks)::float8 AS "clicks",
                SUM(g.impressions)::float8 AS "impressions",
                COALESCE(SUM(g.clicks)::float8 / NULLIF(SUM(g.impressions), 0), 0) AS "ctr",
                COALESCE(SUM(g.position::float8 * g.impressions) / NULLIF(SUM(g.impressions), 0), 0) AS "position"
           FROM "gsc_daily" g
          WHERE g.org_id = $1 AND g.project_id = $2 AND g.date BETWEEN $3 AND $4
          GROUP BY g.query
          ORDER BY SUM(g.impressions) DESC, g.query ASC
          LIMIT $5`,
        [orgId, projectId, from, to, query.limit * CANDIDATE_MULTIPLIER],
      ),
      this.trackedKeywords.findBy({ projectId }),
    ]);

    const trackedNormalized = new Set(
      tracked.map((keyword) => keyword.keywordNormalized),
    );
    const items = candidates
      .filter((row) => !trackedNormalized.has(normalizeKeyword(row.query)))
      .slice(0, query.limit);

    return { from, to, items };
  }
}
