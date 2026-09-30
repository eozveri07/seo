import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  addDays,
  daysInclusive,
  isIsoDate,
  todayUtc,
} from '../../common/dates/utc-date';
import { requireOrgId } from '../../common/tenancy/require-org-id';
import { RankHistoryQueryDto } from './dto/rank-query.dto';
import {
  RankHistoryPointDto,
  RankHistoryResponseDto,
  RankSerpResponseDto,
} from './dto/rank-response.dto';
import { RankCompetitor, RankSource } from './entities/rank-daily.entity';
import {
  InvalidRankDateRangeError,
  RankResultNotFoundError,
} from './rankings.errors';

/** Tarih verilmezse varsayılan geçmiş: bugün dahil 30 gün. */
export const DEFAULT_HISTORY_DAYS = 30;
/** Tek istekte en fazla bir yıllık geçmiş. */
export const MAX_HISTORY_DAYS = 366;

interface HistoryRow extends RankHistoryPointDto {
  trackedKeywordId: string;
}

interface SerpRow {
  trackedKeywordId: string;
  date: string;
  position: number | null;
  rankAbsolute: number | null;
  url: string | null;
  serpFeatures: string[];
  competitorsTop: RankCompetitor[];
  checkedAt: Date;
  source: RankSource;
}

/**
 * Rank sorgu endpoint'leri (`rank_daily`). Her sorgu CLS'teki `org_id` ve
 * `project_id` ile filtrelenir (CLAUDE.md kural 4); projenin org'a ve
 * client_viewer scope'una ait olduğunu `ProjectAccessGuard` doğrular.
 * Başka projenin keyword id'si verilirse sonuç boş/404 olur.
 */
@Injectable()
export class RankingsQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async history(
    projectId: string,
    query: RankHistoryQueryDto,
    today: string = todayUtc(),
  ): Promise<RankHistoryResponseDto> {
    const range = resolveHistoryRange(query, today);
    const keywordIds = [...new Set(query.keywordIds)];
    const orgId = requireOrgId(this.cls);
    const rows = await this.dataSource.query<HistoryRow[]>(
      `
      SELECT "tracked_keyword_id" AS "trackedKeywordId",
        to_char("date", 'YYYY-MM-DD') AS "date",
        "position", "rank_absolute" AS "rankAbsolute", "url", "source"
      FROM "rank_daily"
      WHERE "org_id" = $1 AND "project_id" = $2
        AND "tracked_keyword_id" = ANY($3::uuid[])
        AND "date" BETWEEN $4 AND $5
      ORDER BY "tracked_keyword_id", "date"
      `,
      [orgId, projectId, keywordIds, range.from, range.to],
    );

    const points = new Map<string, RankHistoryPointDto[]>(
      keywordIds.map((id) => [id, []]),
    );
    for (const { trackedKeywordId, ...point } of rows) {
      points.get(trackedKeywordId)?.push(point);
    }
    return {
      ...range,
      keywords: keywordIds.map((trackedKeywordId) => ({
        trackedKeywordId,
        points: points.get(trackedKeywordId) ?? [],
      })),
    };
  }

  async serp(
    projectId: string,
    trackedKeywordId: string,
    date?: string,
  ): Promise<RankSerpResponseDto> {
    if (date !== undefined && !isIsoDate(date)) {
      throw new InvalidRankDateRangeError(`Geçersiz tarih: ${date}`);
    }
    const orgId = requireOrgId(this.cls);
    const parameters: unknown[] = [orgId, projectId, trackedKeywordId];
    if (date) {
      parameters.push(date);
    }
    const rows = await this.dataSource.query<SerpRow[]>(
      `
      SELECT "tracked_keyword_id" AS "trackedKeywordId",
        to_char("date", 'YYYY-MM-DD') AS "date",
        "position", "rank_absolute" AS "rankAbsolute", "url",
        "serp_features" AS "serpFeatures", "competitors_top" AS "competitorsTop",
        "checked_at" AS "checkedAt", "source"
      FROM "rank_daily"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "tracked_keyword_id" = $3
        ${date ? 'AND "date" = $4' : ''}
      ORDER BY "date" DESC
      LIMIT 1
      `,
      parameters,
    );
    const row = rows[0];
    if (!row) {
      throw new RankResultNotFoundError();
    }
    return row;
  }
}

export function resolveHistoryRange(
  query: { from?: string; to?: string },
  today: string,
): { from: string; to: string } {
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(DEFAULT_HISTORY_DAYS - 1));
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new InvalidRankDateRangeError('Geçersiz tarih.');
  }
  const days = daysInclusive(from, to);
  if (days === 0) {
    throw new InvalidRankDateRangeError("'from', 'to'dan sonra olamaz.");
  }
  if (days > MAX_HISTORY_DAYS) {
    throw new InvalidRankDateRangeError(
      `Tarih aralığı en fazla ${MAX_HISTORY_DAYS} gün olabilir.`,
    );
  }
  return { from, to };
}
