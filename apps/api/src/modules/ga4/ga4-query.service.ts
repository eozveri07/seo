import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { addDays, isIsoDate, todayUtc } from '../../common/dates/utc-date';
import { Page, pageOffset } from '../../common/pagination/pagination-query.dto';
import { requireOrgId } from '../../common/tenancy/require-org-id';
import {
  Ga4DateRangeQueryDto,
  Ga4SortField,
  ListGa4LandingPagesQueryDto,
  SortOrder,
} from './dto/ga4-query.dto';
import {
  Ga4ChannelTotalsDto,
  Ga4LandingPageRowDto,
  Ga4OverviewResponseDto,
  Ga4TotalsDto,
} from './dto/ga4-response.dto';
import { InvalidGa4DateRangeError } from './ga4.errors';

/** Tarih verilmezse varsayılan aralık: dünden geriye 28 gün. */
export const DEFAULT_RANGE_DAYS = 28;

export interface DateRange {
  from: string;
  to: string;
}

const AGGREGATES = `
  SUM("sessions")::float8 AS "sessions",
  SUM("engaged_sessions")::float8 AS "engagedSessions",
  SUM("key_events")::float8 AS "keyEvents",
  SUM("total_revenue")::float8 AS "totalRevenue"`;

/** `channel_group`'un organik değeri (ARCHITECTURE §5.4); T1.10 `summary` job'u bu kanalı okur. */
export const GA4_ORGANIC_CHANNEL = 'Organic Search';

const SORT_COLUMNS: Record<Ga4SortField, string> = {
  [Ga4SortField.Sessions]: '"sessions"',
  [Ga4SortField.EngagedSessions]: '"engagedSessions"',
  [Ga4SortField.KeyEvents]: '"keyEvents"',
  [Ga4SortField.TotalRevenue]: '"totalRevenue"',
};

interface LandingPageRow {
  hash: string;
  label: string;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
  totalRevenue: number;
}

/**
 * GA4 sorgu endpoint'leri (PLAN T1.6). `ga4_daily`'den okur (ARCHITECTURE
 * §5.4); "kanal kırılımlı" toplamlar `channel_group`'a göre gruplanır,
 * landing page tablosunda `channel` filtresi sorgu tarafında uygulanır
 * (Faz 1'de tüm kanallar çekilir, organik analiz filtrelenerek yapılır).
 * T1.5'teki `GscQueryService` kalıbı.
 */
@Injectable()
export class Ga4QueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Tek bir günün organik oturum ve key event toplamı (T1.10 `summary` job'u). */
  async organicDayTotals(
    projectId: string,
    date: string,
  ): Promise<{ sessions: number; keyEvents: number }> {
    const orgId = requireOrgId(this.cls);
    const rows = await this.dataSource.query<
      { sessions: number; keyEvents: number }[]
    >(
      `SELECT COALESCE(SUM("sessions"), 0)::float8 AS "sessions",
              COALESCE(SUM("key_events"), 0)::float8 AS "keyEvents"
         FROM "ga4_daily"
        WHERE "org_id" = $1 AND "project_id" = $2 AND "date" = $3
          AND "channel_group" = $4`,
      [orgId, projectId, date, GA4_ORGANIC_CHANNEL],
    );
    return rows[0] ?? { sessions: 0, keyEvents: 0 };
  }

  async overview(
    projectId: string,
    query: Ga4DateRangeQueryDto,
    today: string = todayUtc(),
  ): Promise<Ga4OverviewResponseDto> {
    const orgId = requireOrgId(this.cls);
    const range = resolveRange(query, today);
    const channels = await this.dataSource.query<Ga4ChannelTotalsDto[]>(
      `SELECT "channel_group" AS "channelGroup",${AGGREGATES}
         FROM "ga4_daily"
        WHERE "org_id" = $1 AND "project_id" = $2 AND "date" BETWEEN $3 AND $4
        GROUP BY "channel_group"
        ORDER BY "sessions" DESC`,
      [orgId, projectId, range.from, range.to],
    );
    return { ...range, totals: totalsOf(channels), channels };
  }

  async landingPages(
    projectId: string,
    query: ListGa4LandingPagesQueryDto,
    today: string = todayUtc(),
  ): Promise<Page<Ga4LandingPageRowDto>> {
    const orgId = requireOrgId(this.cls);
    const range = resolveRange(query, today);
    const parameters: unknown[] = [orgId, projectId, range.from, range.to];
    const conditions = [
      '"org_id" = $1',
      '"project_id" = $2',
      '"date" BETWEEN $3 AND $4',
    ];
    if (query.channel) {
      parameters.push(query.channel);
      conditions.push(`"channel_group" = $${parameters.length}`);
    }
    if (query.search) {
      parameters.push(`%${escapeLike(query.search)}%`);
      conditions.push(`"landing_page" ILIKE $${parameters.length}`);
    }
    const where = conditions.join(' AND ');

    const [{ total }] = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(DISTINCT "landing_page_hash")::int AS "total"
         FROM "ga4_daily" WHERE ${where}`,
      parameters,
    );

    const sort = SORT_COLUMNS[query.sort ?? Ga4SortField.Sessions];
    const order = query.order === SortOrder.Asc ? 'ASC' : 'DESC';
    const items = await this.dataSource.query<LandingPageRow[]>(
      `SELECT "landing_page_hash" AS "hash",
              MIN("landing_page") AS "label",${AGGREGATES}
         FROM "ga4_daily"
        WHERE ${where}
        GROUP BY "landing_page_hash"
        ORDER BY ${sort} ${order}, "hash" ASC
        LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
      [...parameters, query.limit, pageOffset(query)],
    );

    return {
      items: items.map(toLandingPageRow),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}

/** Verilmeyen uçlar varsayılanla doldurulur; `from > to` ya da geçersiz gün 400 döner. */
export function resolveRange(
  query: Ga4DateRangeQueryDto,
  today: string,
): DateRange {
  const to = query.to ?? addDays(today, -1);
  const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new InvalidGa4DateRangeError('Geçersiz tarih.');
  }
  if (from > to) {
    throw new InvalidGa4DateRangeError('from, to tarihinden sonra olamaz.');
  }
  return { from, to };
}

export function totalsOf(channels: Ga4TotalsDto[]): Ga4TotalsDto {
  let sessions = 0;
  let engagedSessions = 0;
  let keyEvents = 0;
  let totalRevenue = 0;
  for (const channel of channels) {
    sessions += channel.sessions;
    engagedSessions += channel.engagedSessions;
    keyEvents += channel.keyEvents;
    totalRevenue += channel.totalRevenue;
  }
  return { sessions, engagedSessions, keyEvents, totalRevenue };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toLandingPageRow(row: LandingPageRow): Ga4LandingPageRowDto {
  return {
    landingPageHash: row.hash,
    landingPage: row.label,
    sessions: row.sessions,
    engagedSessions: row.engagedSessions,
    keyEvents: row.keyEvents,
    totalRevenue: row.totalRevenue,
  };
}
