import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppClsStore } from '../../common/cls-store';
import { md5 } from '../../common/hash/md5';
import { requireOrgId } from '../../common/tenancy/require-org-id';

/** ARCHITECTURE §9.1/§9.2 kalıbı: upsert'ler 1000'lik batch'lerle yapılır. */
export const GA4_UPSERT_BATCH_SIZE = 1000;

export interface Ga4Row {
  date: string;
  landingPage: string;
  channelGroup: string;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
  totalRevenue: number;
}

interface UpsertSpec {
  table: string;
  columns: string[];
  conflict: string[];
  update: string[];
}

const GA4_SPEC: UpsertSpec = {
  table: 'ga4_daily',
  columns: [
    'date',
    'org_id',
    'project_id',
    'landing_page',
    'landing_page_hash',
    'channel_group',
    'sessions',
    'engaged_sessions',
    'key_events',
    'total_revenue',
  ],
  conflict: ['date', 'project_id', 'landing_page_hash', 'channel_group'],
  update: [
    'landing_page',
    'sessions',
    'engaged_sessions',
    'key_events',
    'total_revenue',
  ],
};

/**
 * `ga4_daily`'ye yazma (ARCHITECTURE §5.4, §9.2). Her batch tek bir
 * `INSERT ... ON CONFLICT (PK) DO UPDATE`; aynı gün tekrar yazıldığında satır
 * sayısı değişmez (CLAUDE.md kural 7, T1.5'teki `GscStore` kalıbı). `org_id`
 * her zaman CLS'ten alınır.
 *
 * Bir batch'te aynı PK iki kez olursa Postgres "cannot affect row a second
 * time" hatası verir; bu yüzden batch içinde PK'ya göre tekilleştirilir
 * (son gelen kazanır).
 */
@Injectable()
export class Ga4Store {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async upsertRows(projectId: string, rows: Ga4Row[]): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const conflictIndexes = GA4_SPEC.conflict.map((column) =>
      GA4_SPEC.columns.indexOf(column),
    );
    const values = rows.map((row) => [
      row.date,
      orgId,
      projectId,
      row.landingPage,
      md5(row.landingPage),
      row.channelGroup,
      Math.round(row.sessions),
      Math.round(row.engagedSessions),
      Math.round(row.keyEvents),
      row.totalRevenue,
    ]);
    for (
      let offset = 0;
      offset < values.length;
      offset += GA4_UPSERT_BATCH_SIZE
    ) {
      const batch = dedupeByKey(
        values.slice(offset, offset + GA4_UPSERT_BATCH_SIZE),
        conflictIndexes,
      );
      const { sql, parameters } = buildUpsertSql(GA4_SPEC, batch);
      await this.dataSource.query(sql, parameters);
    }
  }
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
