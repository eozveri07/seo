import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { AppClsStore } from '../../common/cls-store';
import { requireOrgId } from '../../common/tenancy/require-org-id';
import { RankCompetitor, RankSource } from './entities/rank-daily.entity';
import { RankTaskStatus } from './entities/rank-task.entity';

/**
 * Bir keyword'ün aynı gün için en fazla kaç kez gönderilmeye çalışılacağı.
 * Gönderilemeyen `failed` task bu sınıra kadar yeniden ayrılabilir.
 */
export const MAX_RANK_TASK_ATTEMPTS = 3;

/** `rank_tasks.error`'a yazılan mesajın üst sınırı. */
const MAX_ERROR_LENGTH = 2000;

export interface ClaimedRankTask {
  id: string;
  trackedKeywordId: string;
}

export interface RankTaskRow {
  id: string;
  projectId: string;
  trackedKeywordId: string;
  checkDate: string;
  providerTaskId: string | null;
  status: RankTaskStatus;
}

export interface ReadyRankTask {
  id: string;
  orgId: string;
  projectId: string;
  providerTaskId: string;
}

export interface RankDay {
  orgId: string;
  projectId: string;
  checkDate: string;
}

export interface RankDailyRow {
  date: string;
  projectId: string;
  trackedKeywordId: string;
  position: number | null;
  rankAbsolute: number | null;
  url: string | null;
  serpFeatures: string[];
  competitorsTop: RankCompetitor[];
  checkedAt: Date;
  source: RankSource;
}

/**
 * `rank_tasks` ve `rank_daily` yazmaları. Raw SQL: claim ve upsert
 * TypeORM'un repository API'siyle ifade edilemiyor. `UPDATE ... RETURNING`
 * satırları CTE içinden okunur, çünkü TypeORM düz UPDATE'te
 * `[rows, rowCount]` döner. Tenant metodları
 * CLS'teki `org_id` ile kapsamlanır (CLAUDE.md kural 4). `system*` metodları
 * `rank-poll` içindir: DataForSEO `tasks_ready` hesap geneli olduğu için
 * org'lar arası çalışır ve yalnız task id'si/zaman üzerinden eşleştirir.
 */
@Injectable()
export class RankStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /**
   * Günün task'larını ayırır: `(tracked_keyword_id, check_date)` için satır
   * yoksa `posted` açılır. DataForSEO'ya hiç ulaşmamış (`provider_task_id`
   * boş) `failed` satır, deneme hakkı kalmışsa yeniden `posted`'a çekilir
   * (`rank-post` yeniden denemesi). Diğer durumlarda (aynı gün zaten
   * gönderilmiş, sonucu alınmış ya da DataForSEO'da başarısız olmuş) satır
   * dönmez, yani o keyword bu çağrıda gönderilmez. Eşzamanlı iki `rank-post`
   * aynı keyword'ü ayıramaz (unique kısıt).
   */
  async claimTasks(
    projectId: string,
    checkDate: string,
    trackedKeywordIds: string[],
  ): Promise<ClaimedRankTask[]> {
    if (trackedKeywordIds.length === 0) {
      return [];
    }
    const orgId = requireOrgId(this.cls);
    const ids = trackedKeywordIds.map(() => uuidv7());
    return this.dataSource.query<ClaimedRankTask[]>(
      `
      INSERT INTO "rank_tasks"
        ("id", "org_id", "project_id", "tracked_keyword_id", "check_date", "status", "posted_at", "attempts")
      SELECT v."id", $1, $2, v."tracked_keyword_id", $3, 'posted', now(), 1
      FROM unnest($4::uuid[], $5::uuid[]) AS v("id", "tracked_keyword_id")
      ON CONFLICT ("tracked_keyword_id", "check_date") DO UPDATE SET
        "status" = 'posted',
        "provider_task_id" = NULL,
        "posted_at" = now(),
        "attempts" = "rank_tasks"."attempts" + 1,
        "error" = NULL,
        "updated_at" = now()
      WHERE "rank_tasks"."org_id" = $1
        AND "rank_tasks"."status" = 'failed'
        AND "rank_tasks"."provider_task_id" IS NULL
        AND "rank_tasks"."attempts" < $6
      RETURNING "id", "tracked_keyword_id" AS "trackedKeywordId"
      `,
      [
        orgId,
        projectId,
        checkDate,
        ids,
        trackedKeywordIds,
        MAX_RANK_TASK_ATTEMPTS,
      ],
    );
  }

  /** `task_post`'un döndüğü DataForSEO task id'lerini yazar. */
  async setProviderTaskIds(
    assignments: { id: string; providerTaskId: string }[],
  ): Promise<void> {
    if (assignments.length === 0) {
      return;
    }
    const orgId = requireOrgId(this.cls);
    await this.dataSource.query(
      `
      UPDATE "rank_tasks" AS t SET
        "provider_task_id" = v."provider_task_id",
        "updated_at" = now()
      FROM unnest($2::uuid[], $3::text[]) AS v("id", "provider_task_id")
      WHERE t."id" = v."id" AND t."org_id" = $1
      `,
      [
        orgId,
        assignments.map((item) => item.id),
        assignments.map((item) => item.providerTaskId),
      ],
    );
  }

  async markFailed(taskIds: string[], error: string): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    const orgId = requireOrgId(this.cls);
    await this.dataSource.query(
      `
      UPDATE "rank_tasks" SET
        "status" = 'failed', "error" = $3, "updated_at" = now()
      WHERE "org_id" = $1 AND "id" = ANY($2::uuid[])
      `,
      [orgId, taskIds, error.slice(0, MAX_ERROR_LENGTH)],
    );
  }

  async findTask(taskId: string): Promise<RankTaskRow | null> {
    const orgId = requireOrgId(this.cls);
    const rows = await this.dataSource.query<RankTaskRow[]>(
      `
      SELECT "id", "project_id" AS "projectId",
        "tracked_keyword_id" AS "trackedKeywordId",
        to_char("check_date", 'YYYY-MM-DD') AS "checkDate",
        "provider_task_id" AS "providerTaskId", "status"
      FROM "rank_tasks"
      WHERE "org_id" = $1 AND "id" = $2
      `,
      [orgId, taskId],
    );
    return rows[0] ?? null;
  }

  async markFetched(taskId: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.dataSource.query(
      `
      UPDATE "rank_tasks" SET
        "status" = 'fetched', "fetched_at" = now(), "error" = NULL, "updated_at" = now()
      WHERE "org_id" = $1 AND "id" = $2
      `,
      [orgId, taskId],
    );
  }

  /** Projenin o günkü açık (`posted`/`ready`) task sayısı; 0 ise gün bitmiştir. */
  async countOpenTasks(projectId: string, checkDate: string): Promise<number> {
    const orgId = requireOrgId(this.cls);
    const rows = await this.dataSource.query<{ count: number }[]>(
      `
      SELECT COUNT(*)::int AS "count"
      FROM "rank_tasks"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "check_date" = $3
        AND "status" IN ('posted', 'ready')
      `,
      [orgId, projectId, checkDate],
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Verilen keyword'lerden `from..to` arasında başarısız olmayan bir task'ı
   * olanlar (haftalık keyword'ün bu hafta kontrol edilip edilmediği).
   */
  async keywordsWithTaskBetween(
    projectId: string,
    trackedKeywordIds: string[],
    from: string,
    to: string,
  ): Promise<Set<string>> {
    if (trackedKeywordIds.length === 0) {
      return new Set();
    }
    const orgId = requireOrgId(this.cls);
    const rows = await this.dataSource.query<{ trackedKeywordId: string }[]>(
      `
      SELECT DISTINCT "tracked_keyword_id" AS "trackedKeywordId"
      FROM "rank_tasks"
      WHERE "org_id" = $1 AND "project_id" = $2
        AND "tracked_keyword_id" = ANY($3::uuid[])
        AND "check_date" BETWEEN $4 AND $5
        AND "status" <> 'failed'
      `,
      [orgId, projectId, trackedKeywordIds, from, to],
    );
    return new Set(rows.map((row) => row.trackedKeywordId));
  }

  /** `(date, tracked_keyword_id)` başına tek satır; tekrar çalışmada son hali kalır. */
  async upsertRankDaily(row: RankDailyRow): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.dataSource.query(
      `
      INSERT INTO "rank_daily"
        ("date", "org_id", "project_id", "tracked_keyword_id", "position", "rank_absolute",
         "url", "serp_features", "competitors_top", "checked_at", "source")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10, $11)
      ON CONFLICT ("date", "tracked_keyword_id") DO UPDATE SET
        "position" = EXCLUDED."position",
        "rank_absolute" = EXCLUDED."rank_absolute",
        "url" = EXCLUDED."url",
        "serp_features" = EXCLUDED."serp_features",
        "competitors_top" = EXCLUDED."competitors_top",
        "checked_at" = EXCLUDED."checked_at",
        "source" = EXCLUDED."source"
      WHERE "rank_daily"."org_id" = EXCLUDED."org_id"
      `,
      [
        row.date,
        orgId,
        row.projectId,
        row.trackedKeywordId,
        row.position,
        row.rankAbsolute,
        row.url,
        row.serpFeatures,
        JSON.stringify(row.competitorsTop),
        row.checkedAt,
        row.source,
      ],
    );
  }

  /**
   * `tasks_ready`'de görünen task'ları `ready`'e çeker ve döner. Zaten
   * `ready` olanlar da döner: `rank-fetch` jobId'si deterministik olduğu için
   * yeniden eklemek iş çoğaltmaz, kaybolan bir job'u ise geri getirir.
   */
  async systemMarkReady(providerTaskIds: string[]): Promise<ReadyRankTask[]> {
    if (providerTaskIds.length === 0) {
      return [];
    }
    return this.dataSource.query<ReadyRankTask[]>(
      `
      WITH ready AS (
        UPDATE "rank_tasks" SET "status" = 'ready', "updated_at" = now()
        WHERE "provider_task_id" = ANY($1::text[])
          AND "status" IN ('posted', 'ready')
        RETURNING "id", "org_id", "project_id", "provider_task_id"
      )
      SELECT "id", "org_id" AS "orgId", "project_id" AS "projectId",
        "provider_task_id" AS "providerTaskId"
      FROM ready
      `,
      [providerTaskIds],
    );
  }

  /**
   * ARCHITECTURE §9.3: `postedBefore`'dan önce gönderilip hâlâ açık olan
   * task'ları `failed` yapar; etkilenen `(org, proje, gün)`'leri döner.
   * Keyword sonraki dispatch'te yeniden gönderilir.
   */
  async systemFailStale(postedBefore: Date, error: string): Promise<RankDay[]> {
    return this.dataSource.query<RankDay[]>(
      `
      WITH stale AS (
        UPDATE "rank_tasks" SET
          "status" = 'failed', "error" = $2, "updated_at" = now()
        WHERE "status" IN ('posted', 'ready') AND "posted_at" < $1
        RETURNING "org_id", "project_id", "check_date"
      )
      SELECT DISTINCT "org_id" AS "orgId", "project_id" AS "projectId",
        to_char("check_date", 'YYYY-MM-DD') AS "checkDate"
      FROM stale
      `,
      [postedBefore, error],
    );
  }
}
