import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { addDays } from '../../common/dates/utc-date';
import { RankHistoryPoint } from './rank-summary-calc';

export interface RankPositionDistribution {
  /** O gün kontrol edilen (rank_daily'de satırı olan) keyword sayısı. */
  tracked: number;
  top3: number;
  top10: number;
  top20: number;
  top100: number;
  /** Bulunan (depth içi) pozisyonların ortalaması; hiçbiri bulunamadıysa `null`. */
  avgPosition: number | null;
  /** O gün kontrol edilen tüm keyword'lerin pozisyonu (visibility skoru için); bulunamayan `null`. */
  positions: (number | null)[];
  /** O gün bulunan keyword id'leri (`keyword_rank_latest` bunlar için güncellenir). */
  trackedKeywordIds: string[];
}

interface DailyPositionRow {
  trackedKeywordId: string;
  position: number | null;
}

interface HistoryRow {
  trackedKeywordId: string;
  date: string;
  position: number | null;
}

interface BestPositionRow {
  trackedKeywordId: string;
  bestPosition: number | null;
}

export interface LatestUpsertRow {
  trackedKeywordId: string;
  position: number | null;
  url: string | null;
  previousPosition: number | null;
  change1d: number | null;
  change7d: number | null;
  change30d: number | null;
  bestPosition: number | null;
  sparkline: (number | null)[];
}

/**
 * `summary` job'unun (T1.10) `rank_daily`/`keyword_rank_latest` okuma ve
 * yazmaları. `RankStore`'dan ayrı: rank-post/poll/fetch akışıyla ilgisi yok,
 * yalnız günlük özet ve latest güncellemesi içindir.
 */
@Injectable()
export class RankSummaryStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** O günün pozisyon dağılımı; `org_id`/`project_id` ile kapsamlanır. */
  async distribution(
    orgId: string,
    projectId: string,
    date: string,
  ): Promise<RankPositionDistribution> {
    const rows = await this.dataSource.query<DailyPositionRow[]>(
      `
      SELECT "tracked_keyword_id" AS "trackedKeywordId", "position"
      FROM "rank_daily"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "date" = $3
      `,
      [orgId, projectId, date],
    );
    const positions = rows.map((row) => row.position);
    const found = positions.filter((value): value is number => value !== null);
    return {
      tracked: rows.length,
      top3: found.filter((value) => value <= 3).length,
      top10: found.filter((value) => value <= 10).length,
      top20: found.filter((value) => value <= 20).length,
      top100: found.filter((value) => value <= 100).length,
      avgPosition:
        found.length > 0
          ? found.reduce((sum, value) => sum + value, 0) / found.length
          : null,
      positions,
      trackedKeywordIds: rows.map((row) => row.trackedKeywordId),
    };
  }

  /**
   * Verilen keyword'lerin `date - 30`..`date` arası pozisyon geçmişi
   * (`rank-summary-calc`'in `history` girdisi) ve o an bilinen en iyi
   * pozisyonları (`keyword_rank_latest.best_position`).
   */
  async historyAndBest(
    orgId: string,
    projectId: string,
    date: string,
    trackedKeywordIds: string[],
  ): Promise<{
    history: Map<string, RankHistoryPoint[]>;
    urls: Map<string, string | null>;
    existingBest: Map<string, number | null>;
  }> {
    const history = new Map<string, RankHistoryPoint[]>();
    const urls = new Map<string, string | null>();
    const existingBest = new Map<string, number | null>();
    if (trackedKeywordIds.length === 0) {
      return { history, urls, existingBest };
    }
    const from = addDays(date, -30);

    const rows = await this.dataSource.query<
      (HistoryRow & { url: string | null })[]
    >(
      `
      SELECT "tracked_keyword_id" AS "trackedKeywordId",
        to_char("date", 'YYYY-MM-DD') AS "date", "position", "url"
      FROM "rank_daily"
      WHERE "org_id" = $1 AND "project_id" = $2
        AND "tracked_keyword_id" = ANY($3::uuid[])
        AND "date" BETWEEN $4 AND $5
      ORDER BY "tracked_keyword_id", "date" ASC
      `,
      [orgId, projectId, trackedKeywordIds, from, date],
    );
    for (const id of trackedKeywordIds) {
      history.set(id, []);
      urls.set(id, null);
    }
    for (const row of rows) {
      history
        .get(row.trackedKeywordId)
        ?.push({ date: row.date, position: row.position });
      if (row.date === date) {
        urls.set(row.trackedKeywordId, row.url);
      }
    }

    const bestRows = await this.dataSource.query<BestPositionRow[]>(
      `
      SELECT "tracked_keyword_id" AS "trackedKeywordId", "best_position" AS "bestPosition"
      FROM "keyword_rank_latest"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "tracked_keyword_id" = ANY($3::uuid[])
      `,
      [orgId, projectId, trackedKeywordIds],
    );
    for (const id of trackedKeywordIds) {
      existingBest.set(id, null);
    }
    for (const row of bestRows) {
      existingBest.set(row.trackedKeywordId, row.bestPosition);
    }

    return { history, urls, existingBest };
  }

  /**
   * `keyword_rank_latest`'i keyword başına upsert eder. Job bazında keyword
   * sayısı sınırlıdır (bir günde değişen keyword'ler); bulk `unnest` burada
   * kullanılmaz çünkü `sparkline` (smallint[][]) unnest'te tek seviyeye
   * düzleşir ve satır hizası bozulur. `GET /projects/summary`'nin aksine bu
   * bir arka plan job'u, "tek sorukla" zorunluluğu yalnız o endpoint için.
   */
  async upsertLatest(
    orgId: string,
    projectId: string,
    row: LatestUpsertRow,
  ): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO "keyword_rank_latest"
        ("tracked_keyword_id", "org_id", "project_id", "position", "url",
         "previous_position", "change_1d", "change_7d", "change_30d",
         "best_position", "sparkline", "updated_at")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::smallint[], now())
      ON CONFLICT ("tracked_keyword_id") DO UPDATE SET
        "position" = EXCLUDED."position",
        "url" = EXCLUDED."url",
        "previous_position" = EXCLUDED."previous_position",
        "change_1d" = EXCLUDED."change_1d",
        "change_7d" = EXCLUDED."change_7d",
        "change_30d" = EXCLUDED."change_30d",
        "best_position" = EXCLUDED."best_position",
        "sparkline" = EXCLUDED."sparkline",
        "updated_at" = now()
      WHERE "keyword_rank_latest"."org_id" = $2
      `,
      [
        row.trackedKeywordId,
        orgId,
        projectId,
        row.position,
        row.url,
        row.previousPosition,
        row.change1d,
        row.change7d,
        row.change30d,
        row.bestPosition,
        row.sparkline,
      ],
    );
  }
}
