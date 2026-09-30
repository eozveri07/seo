import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { addDays, isIsoDate, todayUtc } from '../../common/dates/utc-date';
import { ApiUsage, ApiUsageProvider } from './entities/api-usage.entity';
import { UsageGroupBy, UsageReportQueryDto } from './dto/usage-query.dto';
import { UsageReportResponseDto } from './dto/usage-response.dto';
import { InvalidDateRangeError } from './usage.errors';

/** `GET /usage`'ta tarih verilmezse geriye dönük varsayılan gün sayısı. */
export const DEFAULT_USAGE_RANGE_DAYS = 30;

const GROUP_COLUMNS: Record<UsageGroupBy, string> = {
  [UsageGroupBy.Project]: `COALESCE("project_id"::text, 'unassigned')`,
  [UsageGroupBy.Provider]: '"provider"',
  [UsageGroupBy.Day]: `to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
};

export interface RecordUsageInput {
  provider: ApiUsageProvider;
  endpoint: string;
  units: number;
  cost: number;
  orgId?: string;
  projectId?: string;
  jobRunId?: string;
}

export interface UsageDateRange {
  from: string;
  to: string;
}

interface UsageReportRow {
  key: string | null;
  cost: string;
  units: string;
}

/**
 * ARCHITECTURE §5.6 (`api_usage`): dış API çağrılarının maliyet kaydı ve org
 * bazlı raporu. `cost` `numeric(12,6)`; float toplama hatasından kaçınmak
 * için mikro birim (1e6) üzerinden toplanır ve `roundCost` ile yuvarlanır.
 */
@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(ApiUsage)
    private readonly repository: Repository<ApiUsage>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async record(input: RecordUsageInput): Promise<void> {
    await this.repository.insert({
      orgId: input.orgId ?? null,
      projectId: input.projectId ?? null,
      provider: input.provider,
      endpoint: input.endpoint,
      units: input.units,
      cost: formatCost(input.cost),
      jobRunId: input.jobRunId ?? null,
    });
  }

  async report(
    orgId: string,
    query: UsageReportQueryDto,
    today: string = todayUtc(),
  ): Promise<UsageReportResponseDto> {
    const range = resolveUsageRange(query, today);
    const groupBy = query.groupBy ?? UsageGroupBy.Provider;
    const groupExpr = GROUP_COLUMNS[groupBy];

    const rows = await this.dataSource.query<UsageReportRow[]>(
      `SELECT ${groupExpr} AS "key",
              COALESCE(SUM("cost"), 0)::numeric(12,6) AS "cost",
              COALESCE(SUM("units"), 0)::int AS "units"
         FROM "api_usage"
        WHERE "org_id" = $1
          AND "created_at" >= $2::timestamptz
          AND "created_at" < $3::timestamptz
        GROUP BY ${groupExpr}
        ORDER BY "key" ASC`,
      [orgId, `${range.from}T00:00:00Z`, `${addDays(range.to, 1)}T00:00:00Z`],
    );

    const items = rows.map((row) => ({
      key: row.key ?? 'unassigned',
      cost: Number(row.cost),
      units: Number(row.units),
    }));
    const totalCost = roundCost(
      items.reduce((sum, item) => sum + item.cost, 0),
    );
    const totalUnits = items.reduce((sum, item) => sum + item.units, 0);

    return { ...range, groupBy, items, totalCost, totalUnits };
  }
}

export function resolveUsageRange(
  query: { from?: string; to?: string },
  today: string,
): UsageDateRange {
  const to = query.to ?? addDays(today, -1);
  const from = query.from ?? addDays(to, -(DEFAULT_USAGE_RANGE_DAYS - 1));
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new InvalidDateRangeError('Geçersiz tarih.');
  }
  if (from > to) {
    throw new InvalidDateRangeError('from, to tarihinden sonra olamaz.');
  }
  return { from, to };
}

/** Mikro birim (1e6) üzerinden yuvarlar; float toplama hatasını önler. */
export function roundCost(cost: number): number {
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function formatCost(cost: number): string {
  return roundCost(cost).toFixed(6);
}
