import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../../common/cls-store';
import { addDays, isIsoDate, todayUtc } from '../../common/dates/utc-date';
import { requireOrgId } from '../../common/tenancy/require-org-id';
import { OrgRole } from '../../common/tenancy/org-role';
import type { TenantContext } from '../../common/tenancy/tenant-context';
import {
  ProjectSummaryCardsQueryDto,
  ProjectSummaryQueryDto,
} from './dto/summary-query.dto';
import {
  ProjectDailySummaryPointDto,
  ProjectSummaryCardDto,
  ProjectSummaryCardsResponseDto,
  ProjectSummaryMetricDto,
  ProjectSummaryResponseDto,
} from './dto/summary-response.dto';
import { InvalidSummaryDateRangeError } from './summary.errors';
import { ProjectSummaryCardRow, SummaryStore } from './summary-store';
import { ProjectDailySummary } from './entities/project-daily-summary.entity';

/** Tarih verilmezse varsayılan aralık: dünden geriye 28 gün. */
export const DEFAULT_SUMMARY_RANGE_DAYS = 28;

/**
 * Özet sorgu endpoint'leri (`project_daily_summary`); yalnız bu tabloyu
 * okur (ARCHITECTURE §10: panel dashboard'u ham tabloları değil özet
 * tablolarını okur).
 */
@Injectable()
export class SummaryQueryService {
  constructor(
    private readonly store: SummaryStore,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async forProject(
    projectId: string,
    query: ProjectSummaryQueryDto,
    today: string = todayUtc(),
  ): Promise<ProjectSummaryResponseDto> {
    const orgId = requireOrgId(this.cls);
    const range = resolveRange(query, today);
    const rows = await this.store.range(orgId, projectId, range.from, range.to);
    return { ...range, points: rows.map(toPoint) };
  }

  /** `GET /projects/summary`: `client_viewer` yalnız kendi client'ını görür. */
  async cards(
    query: ProjectSummaryCardsQueryDto,
    actor: TenantContext,
  ): Promise<ProjectSummaryCardsResponseDto> {
    const clientId =
      actor.role === OrgRole.ClientViewer
        ? actor.clientId
        : (query.clientId ?? null);
    const rows = await this.store.cards(actor.orgId, clientId);
    return { items: rows.map(toCard) };
  }
}

function toPoint(row: ProjectDailySummary): ProjectDailySummaryPointDto {
  return {
    date: row.date,
    gscClicks: row.gscClicks,
    gscImpressions: row.gscImpressions,
    gscCtr: row.gscCtr,
    gscPosition: row.gscPosition,
    organicSessions: row.organicSessions,
    organicKeyEvents: row.organicKeyEvents,
    kwTracked: row.kwTracked,
    kwTop3: row.kwTop3,
    kwTop10: row.kwTop10,
    kwTop20: row.kwTop20,
    kwTop100: row.kwTop100,
    kwAvgPosition: row.kwAvgPosition,
    visibilityScore: Number(row.visibilityScore),
  };
}

function toCard(row: ProjectSummaryCardRow): ProjectSummaryCardDto {
  return {
    projectId: row.projectId,
    projectName: row.projectName,
    clientId: row.clientId,
    date: row.date,
    clicks: metric(row.clicks, row.clicksPrev7, row.clicksPrev28),
    organicSessions: metric(
      row.organicSessions,
      row.organicSessionsPrev7,
      row.organicSessionsPrev28,
    ),
    avgPosition: metric(
      row.avgPosition,
      row.avgPositionPrev7,
      row.avgPositionPrev28,
    ),
    visibilityScore: metric(
      row.visibilityScore,
      row.visibilityScorePrev7,
      row.visibilityScorePrev28,
    ),
    visibilitySeries: row.visibilitySeries ?? [],
  };
}

function metric(
  value: number | null,
  prev7: number | null,
  prev28: number | null,
): ProjectSummaryMetricDto {
  return {
    value,
    change7d: value !== null && prev7 !== null ? value - prev7 : null,
    change28d: value !== null && prev28 !== null ? value - prev28 : null,
  };
}

export function resolveRange(
  query: { from?: string; to?: string },
  today: string,
): { from: string; to: string } {
  const to = query.to ?? addDays(today, -1);
  const from = query.from ?? addDays(to, -(DEFAULT_SUMMARY_RANGE_DAYS - 1));
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new InvalidSummaryDateRangeError('Geçersiz tarih.');
  }
  if (from > to) {
    throw new InvalidSummaryDateRangeError("'from', 'to'dan sonra olamaz.");
  }
  return { from, to };
}
