import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProjectDailySummary } from './entities/project-daily-summary.entity';

export interface UpsertProjectDailySummaryInput {
  orgId: string;
  projectId: string;
  date: string;
  gscClicks: number;
  gscImpressions: number;
  gscCtr: number;
  gscPosition: number;
  organicSessions: number;
  organicKeyEvents: number;
  kwTracked: number;
  kwTop3: number;
  kwTop10: number;
  kwTop20: number;
  kwTop100: number;
  kwAvgPosition: number | null;
  visibilityScore: number;
}

/** `project_daily_summary` yazma ve proje bazlı okuma (ARCHITECTURE §5.6, §10). */
@Injectable()
export class SummaryStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** `(project_id, date)` başına tek satır; tekrar çalışmada son hali kalır (idempotent). */
  async upsert(input: UpsertProjectDailySummaryInput): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO "project_daily_summary"
        ("date", "project_id", "org_id", "gsc_clicks", "gsc_impressions", "gsc_ctr",
         "gsc_position", "organic_sessions", "organic_key_events", "kw_tracked",
         "kw_top3", "kw_top10", "kw_top20", "kw_top100", "kw_avg_position",
         "visibility_score", "updated_at")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
      ON CONFLICT ("project_id", "date") DO UPDATE SET
        "gsc_clicks" = EXCLUDED."gsc_clicks",
        "gsc_impressions" = EXCLUDED."gsc_impressions",
        "gsc_ctr" = EXCLUDED."gsc_ctr",
        "gsc_position" = EXCLUDED."gsc_position",
        "organic_sessions" = EXCLUDED."organic_sessions",
        "organic_key_events" = EXCLUDED."organic_key_events",
        "kw_tracked" = EXCLUDED."kw_tracked",
        "kw_top3" = EXCLUDED."kw_top3",
        "kw_top10" = EXCLUDED."kw_top10",
        "kw_top20" = EXCLUDED."kw_top20",
        "kw_top100" = EXCLUDED."kw_top100",
        "kw_avg_position" = EXCLUDED."kw_avg_position",
        "visibility_score" = EXCLUDED."visibility_score",
        "updated_at" = now()
      WHERE "project_daily_summary"."org_id" = $3
      `,
      [
        input.date,
        input.projectId,
        input.orgId,
        input.gscClicks,
        input.gscImpressions,
        input.gscCtr,
        input.gscPosition,
        input.organicSessions,
        input.organicKeyEvents,
        input.kwTracked,
        input.kwTop3,
        input.kwTop10,
        input.kwTop20,
        input.kwTop100,
        input.kwAvgPosition,
        input.visibilityScore,
      ],
    );
  }

  /** `GET /projects/:id/summary?from&to`: tek projenin günlük serisi. */
  async range(
    orgId: string,
    projectId: string,
    from: string,
    to: string,
  ): Promise<ProjectDailySummary[]> {
    return this.dataSource.query<ProjectDailySummary[]>(
      `
      SELECT to_char("date", 'YYYY-MM-DD') AS "date", "project_id" AS "projectId",
        "org_id" AS "orgId", "gsc_clicks" AS "gscClicks",
        "gsc_impressions" AS "gscImpressions", "gsc_ctr" AS "gscCtr",
        "gsc_position" AS "gscPosition", "organic_sessions" AS "organicSessions",
        "organic_key_events" AS "organicKeyEvents", "kw_tracked" AS "kwTracked",
        "kw_top3" AS "kwTop3", "kw_top10" AS "kwTop10", "kw_top20" AS "kwTop20",
        "kw_top100" AS "kwTop100", "kw_avg_position" AS "kwAvgPosition",
        "visibility_score"::float8 AS "visibilityScore", "updated_at" AS "updatedAt"
      FROM "project_daily_summary"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4
      ORDER BY "date" ASC
      `,
      [orgId, projectId, from, to],
    );
  }

  /**
   * `GET /projects/summary?clientId` (ARCHITECTURE §10, T1.12): org'un
   * (client_viewer'da tek client'ın) proje kartları, tek sorguda: son
   * değer, 7/28 günlük değişim ve 28 günlük visibility serisi. `projects`
   * tablosuna JOIN edilir (RankableKeywordsService'in `project` join'i gibi,
   * salt okunur kapsam filtresi için; Project entity/repository inject
   * edilmez).
   */
  async cards(
    orgId: string,
    clientId: string | null,
  ): Promise<ProjectSummaryCardRow[]> {
    return this.dataSource.query<ProjectSummaryCardRow[]>(
      `
      WITH scoped_projects AS (
        SELECT "id", "name", "client_id" AS "clientId"
        FROM "projects"
        WHERE "org_id" = $1 AND ($2::uuid IS NULL OR "client_id" = $2)
      ),
      latest AS (
        SELECT DISTINCT ON ("project_id") "project_id" AS "projectId",
          to_char("date", 'YYYY-MM-DD') AS "date",
          "gsc_clicks" AS "clicks", "organic_sessions" AS "organicSessions",
          "kw_avg_position" AS "avgPosition", "visibility_score"::float8 AS "visibilityScore"
        FROM "project_daily_summary"
        WHERE "org_id" = $1
          AND "project_id" IN (SELECT "id" FROM scoped_projects)
        ORDER BY "project_id", "date" DESC
      ),
      prev7 AS (
        SELECT s."project_id" AS "projectId",
          s."gsc_clicks" AS "clicks", s."organic_sessions" AS "organicSessions",
          s."kw_avg_position" AS "avgPosition", s."visibility_score"::float8 AS "visibilityScore"
        FROM "project_daily_summary" s
        JOIN latest l ON l."projectId" = s."project_id" AND s."date" = (l."date"::date - 7)
        WHERE s."org_id" = $1
      ),
      prev28 AS (
        SELECT s."project_id" AS "projectId",
          s."gsc_clicks" AS "clicks", s."organic_sessions" AS "organicSessions",
          s."kw_avg_position" AS "avgPosition", s."visibility_score"::float8 AS "visibilityScore"
        FROM "project_daily_summary" s
        JOIN latest l ON l."projectId" = s."project_id" AND s."date" = (l."date"::date - 28)
        WHERE s."org_id" = $1
      ),
      series AS (
        SELECT s."project_id" AS "projectId",
          array_agg(s."visibility_score"::float8 ORDER BY s."date") AS "visibilitySeries"
        FROM "project_daily_summary" s
        JOIN latest l ON l."projectId" = s."project_id"
        WHERE s."org_id" = $1 AND s."date" > (l."date"::date - 28)
        GROUP BY s."project_id"
      )
      SELECT p."id" AS "projectId", p."name" AS "projectName", p."clientId",
        l."date", l."clicks", l."organicSessions", l."avgPosition", l."visibilityScore",
        p7."clicks" AS "clicksPrev7", p7."organicSessions" AS "organicSessionsPrev7",
        p7."avgPosition" AS "avgPositionPrev7", p7."visibilityScore" AS "visibilityScorePrev7",
        p28."clicks" AS "clicksPrev28", p28."organicSessions" AS "organicSessionsPrev28",
        p28."avgPosition" AS "avgPositionPrev28", p28."visibilityScore" AS "visibilityScorePrev28",
        COALESCE(sr."visibilitySeries", '{}') AS "visibilitySeries"
      FROM scoped_projects p
      LEFT JOIN latest l ON l."projectId" = p."id"
      LEFT JOIN prev7 p7 ON p7."projectId" = p."id"
      LEFT JOIN prev28 p28 ON p28."projectId" = p."id"
      LEFT JOIN series sr ON sr."projectId" = p."id"
      ORDER BY p."name" ASC, p."id" ASC
      `,
      [orgId, clientId],
    );
  }
}

export interface ProjectSummaryCardRow {
  projectId: string;
  projectName: string;
  clientId: string;
  date: string | null;
  clicks: number | null;
  organicSessions: number | null;
  avgPosition: number | null;
  visibilityScore: number | null;
  clicksPrev7: number | null;
  organicSessionsPrev7: number | null;
  avgPositionPrev7: number | null;
  visibilityScorePrev7: number | null;
  clicksPrev28: number | null;
  organicSessionsPrev28: number | null;
  avgPositionPrev28: number | null;
  visibilityScorePrev28: number | null;
  visibilitySeries: number[];
}
