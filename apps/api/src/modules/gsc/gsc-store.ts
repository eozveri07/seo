import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { requireOrgId } from '../../common/tenancy/require-org-id';

/** ARCHITECTURE §9.1: upsert'ler 1000'lik batch'lerle yapılır. */
export const GSC_UPSERT_BATCH_SIZE = 1000;

interface Metrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSiteRow extends Metrics {
  date: string;
}

export interface GscPageRow extends Metrics {
  date: string;
  page: string;
  device: string;
  country: string;
}

export interface GscQueryRow extends GscPageRow {
  query: string;
}

/** `md5(text)` ile aynı sonuç (UTF-8, küçük harf hex). */
export function md5(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

interface UpsertSpec {
  table: string;
  columns: string[];
  conflict: string[];
  update: string[];
}

const SITE_SPEC: UpsertSpec = {
  table: 'gsc_site_daily',
  columns: [
    'date',
    'org_id',
    'project_id',
    'clicks',
    'impressions',
    'ctr',
    'position',
  ],
  conflict: ['project_id', 'date'],
  update: ['clicks', 'impressions', 'ctr', 'position'],
};

const PAGE_SPEC: UpsertSpec = {
  table: 'gsc_page_daily',
  columns: [
    'date',
    'org_id',
    'project_id',
    'page',
    'page_hash',
    'device',
    'country',
    'clicks',
    'impressions',
    'ctr',
    'position',
  ],
  conflict: ['date', 'project_id', 'page_hash', 'device', 'country'],
  update: ['page', 'clicks', 'impressions', 'ctr', 'position'],
};

const QUERY_SPEC: UpsertSpec = {
  table: 'gsc_daily',
  columns: [
    'date',
    'org_id',
    'project_id',
    'query',
    'query_hash',
    'page',
    'page_hash',
    'country',
    'device',
    'clicks',
    'impressions',
    'ctr',
    'position',
  ],
  conflict: [
    'date',
    'project_id',
    'query_hash',
    'page_hash',
    'country',
    'device',
  ],
  update: ['query', 'page', 'clicks', 'impressions', 'ctr', 'position'],
};

/**
 * GSC tablolarına yazma (ARCHITECTURE §5.3, §9.1). Her batch tek bir
 * `INSERT ... ON CONFLICT (PK) DO UPDATE`; aynı gün tekrar yazıldığında satır
 * sayısı değişmez (CLAUDE.md kural 7). `org_id` her zaman CLS'ten alınır.
 *
 * Bir batch'te aynı PK iki kez olursa Postgres "cannot affect row a second
 * time" hatası verir; bu yüzden batch içinde PK'ya göre tekilleştirilir
 * (son gelen kazanır).
 */
@Injectable()
export class GscStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async upsertSiteRows(projectId: string, rows: GscSiteRow[]): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.upsert(
      SITE_SPEC,
      rows.map((row) => [row.date, orgId, projectId, ...metricValues(row)]),
    );
  }

  async upsertPageRows(projectId: string, rows: GscPageRow[]): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.upsert(
      PAGE_SPEC,
      rows.map((row) => [
        row.date,
        orgId,
        projectId,
        row.page,
        md5(row.page),
        row.device,
        row.country,
        ...metricValues(row),
      ]),
    );
  }

  async upsertQueryRows(projectId: string, rows: GscQueryRow[]): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.upsert(
      QUERY_SPEC,
      rows.map((row) => [
        row.date,
        orgId,
        projectId,
        row.query,
        md5(row.query),
        row.page,
        md5(row.page),
        row.country,
        row.device,
        ...metricValues(row),
      ]),
    );
  }

  private async upsert(spec: UpsertSpec, values: unknown[][]): Promise<void> {
    const conflictIndexes = spec.conflict.map((column) =>
      spec.columns.indexOf(column),
    );
    for (
      let offset = 0;
      offset < values.length;
      offset += GSC_UPSERT_BATCH_SIZE
    ) {
      const batch = dedupeByKey(
        values.slice(offset, offset + GSC_UPSERT_BATCH_SIZE),
        conflictIndexes,
      );
      const { sql, parameters } = buildUpsertSql(spec, batch);
      await this.dataSource.query(sql, parameters);
    }
  }
}

function metricValues(row: Metrics): number[] {
  return [
    Math.round(row.clicks),
    Math.round(row.impressions),
    row.ctr,
    row.position,
  ];
}

function dedupeByKey(rows: unknown[][], keyIndexes: number[]): unknown[][] {
  const byKey = new Map<string, unknown[]>();
  for (const row of rows) {
    byKey.set(
      keyIndexes.map((index) => String(row[index])).join('\u0000'),
      row,
    );
  }
  return [...byKey.values()];
}

function buildUpsertSql(
  spec: UpsertSpec,
  rows: unknown[][],
): { sql: string; parameters: unknown[] } {
  const width = spec.columns.length;
  const parameters: unknown[] = [];
  const tuples = rows.map((row, rowIndex) => {
    parameters.push(...row);
    const placeholders = spec.columns.map(
      (_column, columnIndex) => `$${rowIndex * width + columnIndex + 1}`,
    );
    return `(${placeholders.join(', ')})`;
  });
  const sql =
    `INSERT INTO "${spec.table}" (${spec.columns.map((c) => `"${c}"`).join(', ')}) ` +
    `VALUES ${tuples.join(', ')} ` +
    `ON CONFLICT (${spec.conflict.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ` +
    spec.update.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  return { sql, parameters };
}
