import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { addDays, daysInclusive } from '../../common/dates/utc-date';
import {
  ReportDataResponseDto,
  ReportGscTrendPointDto,
  ReportKeywordDistributionDto,
  ReportKeywordMoverDto,
  ReportPeriodMetricsDto,
  ReportTopPageDto,
} from './dto/report-data-response.dto';
import { Report } from './entities/report.entity';

const TOP_MOVERS_LIMIT = 10;
const TOP_PAGES_LIMIT = 10;

interface ProjectAndClientRow {
  projectName: string;
  clientName: string;
  branding: Record<string, unknown> | null;
}

/**
 * Rapor verisini, `reports` kaydının proje ve dönemine göre özet
 * tablolarından kurar (ARCHITECTURE §12): `project_daily_summary` (dönem
 * özeti + GSC trendi), `keyword_rank_latest` (dağılım + en çok yükselen/
 * düşen), `gsc_page_daily` (top sayfalar), `clients.branding` (kapak).
 * Yalnız `ReportTokenGuard`'ın CLS'e yazdığı org kapsamında okur; proje ve
 * client sorguları org_id ile filtrelenir (TenantRepository kullanılmaz,
 * `SummaryStore.cards` gibi salt okunur bir cross-entity join'dir).
 */
@Injectable()
export class ReportDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async build(report: Report): Promise<ReportDataResponseDto> {
    const previous = previousPeriod(report.periodStart, report.periodEnd);

    const [
      projectAndClient,
      period,
      previousMetrics,
      trend,
      distribution,
      topGainers,
      topLosers,
      topPages,
    ] = await Promise.all([
      this.projectAndClient(report.orgId, report.projectId),
      this.periodMetrics(
        report.orgId,
        report.projectId,
        report.periodStart,
        report.periodEnd,
      ),
      this.periodMetrics(
        report.orgId,
        report.projectId,
        previous.start,
        previous.end,
      ),
      this.gscTrend(
        report.orgId,
        report.projectId,
        report.periodStart,
        report.periodEnd,
      ),
      this.keywordDistribution(report.orgId, report.projectId),
      this.topMovers(report.orgId, report.projectId, 'ASC'),
      this.topMovers(report.orgId, report.projectId, 'DESC'),
      this.topPages(
        report.orgId,
        report.projectId,
        report.periodStart,
        report.periodEnd,
      ),
    ]);

    return {
      reportId: report.id,
      projectId: report.projectId,
      projectName: projectAndClient.projectName,
      clientName: projectAndClient.clientName,
      branding: projectAndClient.branding ?? {},
      type: report.type,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      previousPeriodStart: previous.start,
      previousPeriodEnd: previous.end,
      period,
      previousPeriod: previousMetrics,
      gscTrend: trend,
      keywordDistribution: distribution,
      topGainers,
      topLosers,
      topPages,
      analystNote: report.analystNote,
      generatedAt: new Date().toISOString(),
    };
  }

  private async projectAndClient(
    orgId: string,
    projectId: string,
  ): Promise<ProjectAndClientRow> {
    const rows = await this.dataSource.query<ProjectAndClientRow[]>(
      `
      SELECT p."name" AS "projectName", c."name" AS "clientName", c."branding" AS "branding"
      FROM "projects" p
      JOIN "clients" c ON c."id" = p."client_id"
      WHERE p."org_id" = $1 AND p."id" = $2
      `,
      [orgId, projectId],
    );
    return rows[0] ?? { projectName: '', clientName: '', branding: {} };
  }

  private async periodMetrics(
    orgId: string,
    projectId: string,
    from: string,
    to: string,
  ): Promise<ReportPeriodMetricsDto> {
    const rows = await this.dataSource.query<
      {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
        organicSessions: number;
        organicKeyEvents: number;
      }[]
    >(
      `
      SELECT
        COALESCE(SUM("gsc_clicks"), 0)::float8 AS "clicks",
        COALESCE(SUM("gsc_impressions"), 0)::float8 AS "impressions",
        COALESCE(SUM("gsc_clicks") / NULLIF(SUM("gsc_impressions"), 0), 0)::float8 AS "ctr",
        COALESCE(SUM("gsc_position" * "gsc_impressions") / NULLIF(SUM("gsc_impressions"), 0), 0)::float8 AS "position",
        COALESCE(SUM("organic_sessions"), 0)::float8 AS "organicSessions",
        COALESCE(SUM("organic_key_events"), 0)::float8 AS "organicKeyEvents"
      FROM "project_daily_summary"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4
      `,
      [orgId, projectId, from, to],
    );
    return (
      rows[0] ?? {
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
        organicSessions: 0,
        organicKeyEvents: 0,
      }
    );
  }

  private async gscTrend(
    orgId: string,
    projectId: string,
    from: string,
    to: string,
  ): Promise<ReportGscTrendPointDto[]> {
    return this.dataSource.query<ReportGscTrendPointDto[]>(
      `
      SELECT to_char("date", 'YYYY-MM-DD') AS "date",
        "gsc_clicks"::float8 AS "clicks", "gsc_impressions"::float8 AS "impressions",
        "gsc_ctr"::float8 AS "ctr", "gsc_position"::float8 AS "position"
      FROM "project_daily_summary"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4
      ORDER BY "date" ASC
      `,
      [orgId, projectId, from, to],
    );
  }

  private async keywordDistribution(
    orgId: string,
    projectId: string,
  ): Promise<ReportKeywordDistributionDto> {
    const rows = await this.dataSource.query<ReportKeywordDistributionDto[]>(
      `
      SELECT
        COUNT(*) FILTER (WHERE "position" BETWEEN 1 AND 3)::int AS "top3",
        COUNT(*) FILTER (WHERE "position" BETWEEN 4 AND 10)::int AS "top10",
        COUNT(*) FILTER (WHERE "position" BETWEEN 11 AND 20)::int AS "top20",
        COUNT(*) FILTER (WHERE "position" BETWEEN 21 AND 100)::int AS "top100",
        COUNT(*) FILTER (WHERE "position" IS NULL OR "position" > 100)::int AS "beyond",
        COUNT(*)::int AS "total"
      FROM "keyword_rank_latest"
      WHERE "org_id" = $1 AND "project_id" = $2
      `,
      [orgId, projectId],
    );
    return (
      rows[0] ?? { top3: 0, top10: 0, top20: 0, top100: 0, beyond: 0, total: 0 }
    );
  }

  private async topMovers(
    orgId: string,
    projectId: string,
    order: 'ASC' | 'DESC',
  ): Promise<ReportKeywordMoverDto[]> {
    return this.dataSource.query<ReportKeywordMoverDto[]>(
      `
      SELECT k."tracked_keyword_id" AS "trackedKeywordId", tk."keyword" AS "keyword",
        k."position" AS "position", k."change_30d" AS "change30d"
      FROM "keyword_rank_latest" k
      JOIN "tracked_keywords" tk ON tk."id" = k."tracked_keyword_id"
      WHERE k."org_id" = $1 AND k."project_id" = $2 AND k."change_30d" IS NOT NULL
      ORDER BY k."change_30d" ${order === 'ASC' ? 'ASC' : 'DESC'}, tk."keyword" ASC
      LIMIT ${TOP_MOVERS_LIMIT}
      `,
      [orgId, projectId],
    );
  }

  private async topPages(
    orgId: string,
    projectId: string,
    from: string,
    to: string,
  ): Promise<ReportTopPageDto[]> {
    return this.dataSource.query<ReportTopPageDto[]>(
      `
      SELECT "page",
        SUM("clicks")::float8 AS "clicks",
        SUM("impressions")::float8 AS "impressions",
        COALESCE(SUM("clicks")::float8 / NULLIF(SUM("impressions"), 0), 0)::float8 AS "ctr",
        COALESCE(SUM("position"::float8 * "impressions") / NULLIF(SUM("impressions"), 0), 0)::float8 AS "position"
      FROM "gsc_page_daily"
      WHERE "org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4
      GROUP BY "page"
      ORDER BY SUM("clicks") DESC
      LIMIT ${TOP_PAGES_LIMIT}
      `,
      [orgId, projectId, from, to],
    );
  }
}

/** Önceki dönem: aynı gün sayısında, mevcut dönemin hemen öncesi. */
export function previousPeriod(
  periodStart: string,
  periodEnd: string,
): { start: string; end: string } {
  const days = daysInclusive(periodStart, periodEnd);
  const end = addDays(periodStart, -1);
  const start = addDays(end, -(days - 1));
  return { start, end };
}
