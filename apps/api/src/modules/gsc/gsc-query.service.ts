import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import {
  addDays,
  addMonths,
  daysInclusive,
  isIsoDate,
  todayUtc,
} from '../../common/dates/utc-date';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { requireOrgId } from '../../common/tenancy/require-org-id';
import {
  GscCompareMode,
  GscDateRangeQueryDto,
  GscSortField,
  ListGscRowsQueryDto,
  SortOrder,
} from './dto/gsc-query.dto';
import {
  GscDailyPointDto,
  GscOverviewResponseDto,
  GscPageRowDto,
  GscPeriodDto,
  GscQueryRowDto,
  GscTotalsDto,
} from './dto/gsc-response.dto';
import { InvalidDateRangeError } from './gsc.errors';

/** Tarih verilmezse varsayılan aralık: dünden geriye 28 gün. */
export const DEFAULT_RANGE_DAYS = 28;

export interface DateRange {
  from: string;
  to: string;
}

/** Gösterimle ağırlıklı toplama; `ctr` ve `position` toplamdan yeniden hesaplanır. */
const AGGREGATES = `
  SUM("clicks")::float8 AS "clicks",
  SUM("impressions")::float8 AS "impressions",
  COALESCE(SUM("clicks")::float8 / NULLIF(SUM("impressions"), 0), 0) AS "ctr",
  COALESCE(SUM("position"::float8 * "impressions") / NULLIF(SUM("impressions"), 0), 0) AS "position"`;

const SORT_COLUMNS: Record<GscSortField, string> = {
  [GscSortField.Clicks]: '"clicks"',
  [GscSortField.Impressions]: '"impressions"',
  [GscSortField.Ctr]: '"ctr"',
  [GscSortField.Position]: '"position"',
};

interface GroupedSpec {
  table: 'gsc_daily' | 'gsc_page_daily';
  keyColumn: 'query_hash' | 'page_hash';
  labelColumn: 'query' | 'page';
  /** Ek filtre (`queries/:hash/pages` gibi): kolon ve değer. */
  filter?: { column: 'query_hash' | 'page_hash'; value: string };
}

interface GroupedRow {
  hash: string;
  label: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * GSC sorgu endpoint'leri (PLAN T1.5). §5.3'teki ayrım korunur: site
 * toplamları `gsc_site_daily`'den, sayfa tablosu `gsc_page_daily`'den, sorgu
 * tabloları `gsc_daily`'den okunur. Her sorgu CLS'teki `org_id`, `project_id`
 * ve tarih aralığıyla filtrelenir (CLAUDE.md kural 4); projenin org'a ve
 * client_viewer scope'una ait olduğunu `ProjectAccessGuard` doğrular.
 */
@Injectable()
export class GscQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Tek bir günün site toplamı (T1.10 `summary` job'u). */
  async dayTotals(projectId: string, date: string): Promise<GscTotalsDto> {
    const period = await this.sitePeriod(projectId, { from: date, to: date });
    return period.totals;
  }

  async overview(
    projectId: string,
    query: GscDateRangeQueryDto & { compare?: GscCompareMode },
    today: string = todayUtc(),
  ): Promise<GscOverviewResponseDto> {
    const range = resolveRange(query, today);
    const current = await this.sitePeriod(projectId, range);
    const compare = query.compare
      ? await this.sitePeriod(projectId, compareRange(range, query.compare))
      : null;
    return { ...current, compare };
  }

  async queries(
    projectId: string,
    query: ListGscRowsQueryDto,
    today: string = todayUtc(),
  ): Promise<Page<GscQueryRowDto>> {
    const page = await this.grouped(
      projectId,
      { table: 'gsc_daily', keyColumn: 'query_hash', labelColumn: 'query' },
      query,
      today,
    );
    return { ...page, items: page.items.map(toQueryRow) };
  }

  async pages(
    projectId: string,
    query: ListGscRowsQueryDto,
    today: string = todayUtc(),
  ): Promise<Page<GscPageRowDto>> {
    const page = await this.grouped(
      projectId,
      { table: 'gsc_page_daily', keyColumn: 'page_hash', labelColumn: 'page' },
      query,
      today,
    );
    return { ...page, items: page.items.map(toPageRow) };
  }

  /** Bir sorgunun sayfaları (`gsc_daily`). */
  async queryPages(
    projectId: string,
    queryHash: string,
    query: ListGscRowsQueryDto,
    today: string = todayUtc(),
  ): Promise<Page<GscPageRowDto>> {
    const page = await this.grouped(
      projectId,
      {
        table: 'gsc_daily',
        keyColumn: 'page_hash',
        labelColumn: 'page',
        filter: { column: 'query_hash', value: queryHash },
      },
      query,
      today,
    );
    return { ...page, items: page.items.map(toPageRow) };
  }

  /** Bir sayfanın sorguları (`gsc_daily`). */
  async pageQueries(
    projectId: string,
    pageHash: string,
    query: ListGscRowsQueryDto,
    today: string = todayUtc(),
  ): Promise<Page<GscQueryRowDto>> {
    const page = await this.grouped(
      projectId,
      {
        table: 'gsc_daily',
        keyColumn: 'query_hash',
        labelColumn: 'query',
        filter: { column: 'page_hash', value: pageHash },
      },
      query,
      today,
    );
    return { ...page, items: page.items.map(toQueryRow) };
  }

  private async sitePeriod(
    projectId: string,
    range: DateRange,
  ): Promise<GscPeriodDto> {
    const orgId = requireOrgId(this.cls);
    const series = await this.dataSource.query<GscDailyPointDto[]>(
      `SELECT to_char("date", 'YYYY-MM-DD') AS "date",
              "clicks"::float8 AS "clicks",
              "impressions"::float8 AS "impressions",
              "ctr"::float8 AS "ctr",
              "position"::float8 AS "position"
         FROM "gsc_site_daily"
        WHERE "org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4
        ORDER BY "date" ASC`,
      [orgId, projectId, range.from, range.to],
    );
    return { ...range, totals: totalsOf(series), series };
  }

  private async grouped(
    projectId: string,
    spec: GroupedSpec,
    query: ListGscRowsQueryDto,
    today: string,
  ): Promise<Page<GroupedRow>> {
    const orgId = requireOrgId(this.cls);
    const range = resolveRange(query, today);
    const parameters: unknown[] = [orgId, projectId, range.from, range.to];
    const conditions = [
      '"org_id" = $1',
      '"project_id" = $2',
      '"date" BETWEEN $3 AND $4',
    ];
    if (spec.filter) {
      parameters.push(spec.filter.value);
      conditions.push(`"${spec.filter.column}" = $${parameters.length}`);
    }
    if (query.search) {
      parameters.push(`%${escapeLike(query.search)}%`);
      conditions.push(`"${spec.labelColumn}" ILIKE $${parameters.length}`);
    }
    const where = conditions.join(' AND ');

    const [{ total }] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(DISTINCT "${spec.keyColumn}")::int AS "total"
         FROM "${spec.table}" WHERE ${where}`,
      parameters,
    );

    const sort = SORT_COLUMNS[query.sort ?? GscSortField.Clicks];
    const order = query.order === SortOrder.Asc ? 'ASC' : 'DESC';
    const items = await this.dataSource.query<GroupedRow[]>(
      `SELECT "${spec.keyColumn}" AS "hash",
              MIN("${spec.labelColumn}") AS "label",${AGGREGATES}
         FROM "${spec.table}"
        WHERE ${where}
        GROUP BY "${spec.keyColumn}"
        ORDER BY ${sort} ${order}, "hash" ASC
        LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
      [...parameters, query.limit, pageOffset(query)],
    );

    return { items, total, page: query.page, limit: query.limit };
  }
}

/** Verilmeyen uçlar varsayılanla doldurulur; `from > to` ya da geçersiz gün 400 döner. */
export function resolveRange(
  query: GscDateRangeQueryDto,
  today: string,
): DateRange {
  const to = query.to ?? addDays(today, -1);
  const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new InvalidDateRangeError('Geçersiz tarih.');
  }
  if (from > to) {
    throw new InvalidDateRangeError('from, to tarihinden sonra olamaz.');
  }
  return { from, to };
}

export function compareRange(
  range: DateRange,
  mode: GscCompareMode,
): DateRange {
  if (mode === GscCompareMode.Year) {
    return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
  }
  const length = daysInclusive(range.from, range.to);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

export function totalsOf(series: GscTotalsDto[]): GscTotalsDto {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const point of series) {
    clicks += point.clicks;
    impressions += point.impressions;
    weightedPosition += point.position * point.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toQueryRow(row: GroupedRow): GscQueryRowDto {
  return {
    queryHash: row.hash,
    query: row.label,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

function toPageRow(row: GroupedRow): GscPageRowDto {
  return {
    pageHash: row.hash,
    page: row.label,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}
