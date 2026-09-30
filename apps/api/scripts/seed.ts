import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { addDays, todayUtc } from '../src/common/dates/utc-date';
import { md5 } from '../src/common/hash/md5';
import { OrgRole } from '../src/common/tenancy/org-role';
import { GA4_ORGANIC_CHANNEL } from '../src/modules/ga4/ga4-query.service';
import { ProjectStatus } from '../src/modules/clients/entities/project.entity';
import { RankSource } from '../src/modules/rankings/entities/rank-daily.entity';
import { TrackedKeywordDevice } from '../src/modules/keywords/entities/tracked-keyword.entity';
import { RankSummaryService } from '../src/modules/rankings/rank-summary.service';
import { RankSummaryStore } from '../src/modules/rankings/rank-summary-store';
import { SummaryStore } from '../src/modules/summary/summary-store';
import { computeVisibilityScore } from '../src/modules/summary/visibility.constants';

const API_ROOT = join(__dirname, '..');
const HISTORY_DAYS = 60;

/** ARCHITECTURE §15: seed sadece development ortamında çalışır. */
const OWNER_EMAIL = 'owner@demo.local';
const OWNER_NAME = 'Demo Owner';
const OWNER_PASSWORD = 'Demo1234!';
const ORG_NAME = 'Demo Ajans';
const ORG_SLUG = 'demo-ajans';

interface SeedClient {
  name: string;
  projects: SeedProject[];
}

interface SeedProject {
  name: string;
  domain: string;
  keywords: string[];
}

const CLIENTS: SeedClient[] = [
  {
    name: 'Kuzey Giyim',
    projects: [
      {
        name: 'Kuzey Giyim - Ana Site',
        domain: 'kuzeygiyim.com',
        keywords: [
          'kadın mont',
          'erkek kaban',
          'kışlık mont modelleri',
          'trençkot kombinleri',
          'yün kazak',
          'kadın ceket',
          'erkek gömlek',
          'spor ayakkabı',
          'deri ceket',
          'kışlık bot',
          'eşofman takımı',
          'triko elbise',
        ],
      },
      {
        name: 'Kuzey Giyim - Outlet',
        domain: 'outlet.kuzeygiyim.com',
        keywords: [
          'indirimli mont',
          'outlet ayakkabı',
          'sezon sonu kampanya',
          'ucuz kazak',
          'fırsat ürünleri',
          'stok temizliği giyim',
        ],
      },
    ],
  },
  {
    name: 'Mavi Teknoloji',
    projects: [
      {
        name: 'Mavi Teknoloji',
        domain: 'maviteknoloji.com',
        keywords: [
          'laptop tamiri',
          'telefon ekran değişimi',
          'ikinci el laptop',
          'bilgisayar parçaları',
          'oyuncu bilgisayarı',
          'akıllı saat fiyatları',
          'kablosuz kulaklık',
          'powerbank önerileri',
          'ssd fiyatları',
          'ekran kartı fiyatları',
          'laptop soğutucu',
          'bilgisayar kurulumu',
          'wifi router önerisi',
          'usb hub',
        ],
      },
    ],
  },
];

const PAGES = ['/', '/kampanyalar', '/hakkimizda'];
const COUNTRY = 'TR';
const DEVICES = ['desktop', 'mobile'];
const CHANNEL_GROUPS = [GA4_ORGANIC_CHANNEL, 'Direct'];

function loadEnvFiles(): void {
  for (const file of [
    join(API_ROOT, '.env'),
    join(API_ROOT, '..', '..', '.env'),
  ]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL tanımlı değil.');
  }
  return url;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.round(randomBetween(min, max));
}

interface UpsertSpec {
  table: string;
  columns: string[];
  conflict: string[];
  update: string[];
  /** Kolon adı -> placeholder'a eklenecek cast, ör. `::jsonb`. */
  casts?: Record<string, string>;
}

function dedupeByKey(rows: unknown[][], keyIndexes: number[]): unknown[][] {
  const byKey = new Map<string, unknown[]>();
  for (const row of rows) {
    byKey.set(keyIndexes.map((index) => String(row[index])).join('\u0000'), row);
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
    const placeholders = spec.columns.map((column, columnIndex) => {
      const cast = spec.casts?.[column] ?? '';
      return `$${rowIndex * width + columnIndex + 1}${cast}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const sql =
    `INSERT INTO "${spec.table}" (${spec.columns.map((c) => `"${c}"`).join(', ')}) ` +
    `VALUES ${tuples.join(', ')} ` +
    `ON CONFLICT (${spec.conflict.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ` +
    spec.update.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  return { sql, parameters };
}

/** T1.16: GSC/GA4/rank tabloları için `ON CONFLICT DO UPDATE` ile toplu yazma (GscStore/Ga4Store ile aynı desen). */
async function upsertBatch(
  dataSource: DataSource,
  spec: UpsertSpec,
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const conflictIndexes = spec.conflict.map((column) =>
    spec.columns.indexOf(column),
  );
  const batch = dedupeByKey(rows, conflictIndexes);
  const { sql, parameters } = buildUpsertSql(spec, batch);
  await dataSource.query(sql, parameters);
}

const SITE_SPEC: UpsertSpec = {
  table: 'gsc_site_daily',
  columns: ['date', 'org_id', 'project_id', 'clicks', 'impressions', 'ctr', 'position'],
  conflict: ['project_id', 'date'],
  update: ['clicks', 'impressions', 'ctr', 'position'],
};

const PAGE_SPEC: UpsertSpec = {
  table: 'gsc_page_daily',
  columns: [
    'date', 'org_id', 'project_id', 'page', 'page_hash', 'device', 'country',
    'clicks', 'impressions', 'ctr', 'position',
  ],
  conflict: ['date', 'project_id', 'page_hash', 'device', 'country'],
  update: ['page', 'clicks', 'impressions', 'ctr', 'position'],
};

const QUERY_SPEC: UpsertSpec = {
  table: 'gsc_daily',
  columns: [
    'date', 'org_id', 'project_id', 'query', 'query_hash', 'page', 'page_hash',
    'country', 'device', 'clicks', 'impressions', 'ctr', 'position',
  ],
  conflict: ['date', 'project_id', 'query_hash', 'page_hash', 'country', 'device'],
  update: ['query', 'page', 'clicks', 'impressions', 'ctr', 'position'],
};

const GA4_SPEC: UpsertSpec = {
  table: 'ga4_daily',
  columns: [
    'date', 'org_id', 'project_id', 'landing_page', 'landing_page_hash',
    'channel_group', 'sessions', 'engaged_sessions', 'key_events', 'total_revenue',
  ],
  conflict: ['date', 'project_id', 'landing_page_hash', 'channel_group'],
  update: ['landing_page', 'sessions', 'engaged_sessions', 'key_events', 'total_revenue'],
};

const RANK_SPEC: UpsertSpec = {
  table: 'rank_daily',
  columns: [
    'date', 'tracked_keyword_id', 'org_id', 'project_id', 'position',
    'rank_absolute', 'url', 'serp_features', 'competitors_top', 'checked_at', 'source',
  ],
  conflict: ['date', 'tracked_keyword_id'],
  update: ['position', 'rank_absolute', 'url', 'checked_at'],
  casts: { serp_features: '::text[]', competitors_top: '::jsonb' },
};

async function resetOrg(dataSource: DataSource, slug: string): Promise<void> {
  const [org] = await dataSource.query<{ id: string }[]>(
    `SELECT "id" FROM "organizations" WHERE "slug" = $1`,
    [slug],
  );
  if (!org) {
    return;
  }
  // clients siliniminin cascade'i: projects -> tracked_keywords/gsc_*/ga4_daily/rank_*/project_daily_summary.
  await dataSource.query(`DELETE FROM "clients" WHERE "org_id" = $1`, [org.id]);
  // organizations siliniminin cascade'i: memberships, invitations.
  await dataSource.query(`DELETE FROM "organizations" WHERE "id" = $1`, [org.id]);
  await dataSource.query(`DELETE FROM "users" WHERE "email" = $1`, [OWNER_EMAIL]);
  // eslint-disable-next-line no-console
  console.log(`'${slug}' org'u ve tüm verisi silindi (--reset).`);
}

async function upsertOwner(dataSource: DataSource): Promise<string> {
  const [existing] = await dataSource.query<{ id: string }[]>(
    `SELECT "id" FROM "users" WHERE "email" = $1`,
    [OWNER_EMAIL],
  );
  if (existing) {
    return existing.id;
  }
  const id = uuidv7();
  const passwordHash = await argon2.hash(OWNER_PASSWORD, { type: argon2.argon2id });
  await dataSource.query(
    `INSERT INTO "users" ("id", "email", "password_hash", "name", "is_active")
     VALUES ($1, $2, $3, $4, true)`,
    [id, OWNER_EMAIL, passwordHash, OWNER_NAME],
  );
  return id;
}

async function upsertOrg(dataSource: DataSource, ownerId: string): Promise<string> {
  const [row] = await dataSource.query<{ id: string }[]>(
    `INSERT INTO "organizations" ("id", "name", "slug", "settings")
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name"
     RETURNING "id"`,
    [uuidv7(), ORG_NAME, ORG_SLUG, JSON.stringify({ timezone: 'Europe/Istanbul', defaultLanguage: 'tr' })],
  );
  await dataSource.query(
    `INSERT INTO "memberships" ("id", "org_id", "user_id", "role", "client_id", "invited_by")
     VALUES ($1, $2, $3, $4, NULL, NULL)
     ON CONFLICT ("org_id", "user_id") DO NOTHING`,
    [uuidv7(), row.id, ownerId, OrgRole.Owner],
  );
  return row.id;
}

async function upsertClient(
  dataSource: DataSource,
  orgId: string,
  name: string,
): Promise<string> {
  const [existing] = await dataSource.query<{ id: string }[]>(
    `SELECT "id" FROM "clients" WHERE "org_id" = $1 AND "name" = $2`,
    [orgId, name],
  );
  if (existing) {
    return existing.id;
  }
  const id = uuidv7();
  await dataSource.query(
    `INSERT INTO "clients" ("id", "org_id", "name", "contact_emails", "notes", "branding", "is_active")
     VALUES ($1, $2, $3, '{}', NULL, '{}', true)`,
    [id, orgId, name],
  );
  return id;
}

async function upsertProject(
  dataSource: DataSource,
  orgId: string,
  clientId: string,
  project: SeedProject,
): Promise<string> {
  const [row] = await dataSource.query<{ id: string }[]>(
    `INSERT INTO "projects"
       ("id", "org_id", "client_id", "name", "domain", "country_code", "language_code",
        "dfs_location_code", "dfs_language_code", "timezone", "status")
     VALUES ($1, $2, $3, $4, $5, 'TR', 'tr', 2792, 'tr', 'Europe/Istanbul', $6)
     ON CONFLICT ("org_id", "domain") DO UPDATE SET
       "name" = EXCLUDED."name", "client_id" = EXCLUDED."client_id"
     RETURNING "id"`,
    [uuidv7(), orgId, clientId, project.name, project.domain, ProjectStatus.Active],
  );
  return row.id;
}

async function upsertTrackedKeyword(
  dataSource: DataSource,
  orgId: string,
  projectId: string,
  keyword: string,
): Promise<string> {
  const normalized = keyword.trim().toLowerCase().replace(/\s+/g, ' ');
  const [row] = await dataSource.query<{ id: string }[]>(
    `INSERT INTO "tracked_keywords"
       ("id", "org_id", "project_id", "group_id", "keyword", "keyword_normalized",
        "device", "location_code", "language_code", "frequency", "depth",
        "target_url", "tags", "is_active")
     VALUES ($1, $2, $3, NULL, $4, $5, $6, 2792, 'tr', 'daily', 20, NULL, '{}', true)
     ON CONFLICT ("project_id", "keyword_normalized", "device", "location_code", "language_code")
     DO UPDATE SET "keyword" = EXCLUDED."keyword"
     RETURNING "id"`,
    [uuidv7(), orgId, projectId, keyword, normalized, TrackedKeywordDevice.Desktop],
  );
  return row.id;
}

/**
 * Proje başına 60 günlük gerçekçi sahte GSC/GA4/rank verisi (ARCHITECTURE §15):
 * GSC ve GA4 bağlantısı olmadan panelin dolu görünmesi için. Pozisyonlar hafif
 * bir rastgele yürüyüşle değişir; tıklama/gösterim pozisyona göre ölçeklenir.
 */
async function seedProjectHistory(
  dataSource: DataSource,
  orgId: string,
  projectId: string,
  keywordIds: string[],
): Promise<void> {
  const today = todayUtc();
  const dates = Array.from({ length: HISTORY_DAYS }, (_, i) =>
    addDays(today, -(HISTORY_DAYS - i)),
  );

  const keywordPositions = new Map<string, number>(
    keywordIds.map((id) => [id, randomInt(3, 60)]),
  );

  const siteRows: unknown[][] = [];
  const pageRows: unknown[][] = [];
  const queryRows: unknown[][] = [];
  const ga4Rows: unknown[][] = [];
  const rankRows: unknown[][] = [];

  for (const date of dates) {
    const clicks = randomInt(40, 260);
    const impressions = randomInt(clicks * 12, clicks * 40);
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const position = randomBetween(6, 28);
    siteRows.push([date, orgId, projectId, clicks, impressions, ctr, position]);

    let remainingClicks = clicks;
    let remainingImpressions = impressions;
    for (const [pageIndex, page] of PAGES.entries()) {
      for (const device of DEVICES) {
        const isLast =
          pageIndex === PAGES.length - 1 && device === DEVICES[DEVICES.length - 1];
        const pClicks = isLast
          ? Math.max(remainingClicks, 0)
          : randomInt(0, Math.max(remainingClicks, 0));
        const pImpressions = isLast
          ? Math.max(remainingImpressions, 0)
          : randomInt(0, Math.max(remainingImpressions, 0));
        remainingClicks -= pClicks;
        remainingImpressions -= pImpressions;
        const pCtr = pImpressions > 0 ? pClicks / pImpressions : 0;
        const pPosition = randomBetween(5, 30);
        pageRows.push([
          date, orgId, projectId, page, md5(page), device, COUNTRY,
          pClicks, pImpressions, pCtr, pPosition,
        ]);
        queryRows.push([
          date, orgId, projectId, `${page} sorgusu`, md5(`${page} sorgusu ${device}`),
          page, md5(page), COUNTRY, device,
          Math.round(pClicks * 0.6), Math.round(pImpressions * 0.6), pCtr, pPosition,
        ]);
      }
    }

    for (const page of PAGES) {
      for (const channel of CHANNEL_GROUPS) {
        const isOrganic = channel === GA4_ORGANIC_CHANNEL;
        const sessions = randomInt(isOrganic ? 10 : 3, isOrganic ? 80 : 20);
        const engagedSessions = Math.round(sessions * randomBetween(0.4, 0.8));
        const keyEvents = Math.round(sessions * randomBetween(0.01, 0.08));
        const totalRevenue = (sessions * randomBetween(0, 0.5)).toFixed(2);
        ga4Rows.push([
          date, orgId, projectId, page, md5(page), channel,
          sessions, engagedSessions, keyEvents, totalRevenue,
        ]);
      }
    }

    for (const trackedKeywordId of keywordIds) {
      const previous = keywordPositions.get(trackedKeywordId) ?? 30;
      const found = Math.random() > 0.05;
      const next = found
        ? Math.max(1, Math.min(100, previous + randomInt(-3, 3)))
        : previous;
      keywordPositions.set(trackedKeywordId, next);
      const rankPosition = found && next <= 100 ? next : null;
      rankRows.push([
        date, trackedKeywordId, orgId, projectId,
        rankPosition, rankPosition, rankPosition ? `https://example.com/` : null,
        '{}', '[]', new Date(`${date}T06:00:00Z`), RankSource.DfsStandard,
      ]);
    }
  }

  await upsertBatch(dataSource, SITE_SPEC, siteRows);
  await upsertBatch(dataSource, PAGE_SPEC, pageRows);
  await upsertBatch(dataSource, QUERY_SPEC, queryRows);
  await upsertBatch(dataSource, GA4_SPEC, ga4Rows);
  await upsertBatch(dataSource, RANK_SPEC, rankRows);

  const rankSummary = new RankSummaryService(new RankSummaryStore(dataSource));
  const summaryStore = new SummaryStore(dataSource);
  for (const date of dates) {
    const [siteRow] = await dataSource.query<
      { clicks: number; impressions: number; ctr: number; position: number }[]
    >(
      `SELECT "clicks", "impressions", "ctr"::float8 AS "ctr", "position"::float8 AS "position"
       FROM "gsc_site_daily" WHERE "project_id" = $1 AND "date" = $2`,
      [projectId, date],
    );
    const [ga4Row] = await dataSource.query<
      { sessions: number; keyEvents: number }[]
    >(
      `SELECT COALESCE(SUM("sessions"), 0)::float8 AS "sessions",
              COALESCE(SUM("key_events"), 0)::float8 AS "keyEvents"
       FROM "ga4_daily" WHERE "project_id" = $1 AND "date" = $2 AND "channel_group" = $3`,
      [projectId, date, GA4_ORGANIC_CHANNEL],
    );
    const rank = await rankSummary.summarize(orgId, projectId, date);
    const visibilityScore = computeVisibilityScore(rank.positions);
    await summaryStore.upsert({
      orgId,
      projectId,
      date,
      gscClicks: siteRow?.clicks ?? 0,
      gscImpressions: siteRow?.impressions ?? 0,
      gscCtr: siteRow?.ctr ?? 0,
      gscPosition: siteRow?.position ?? 0,
      organicSessions: ga4Row?.sessions ?? 0,
      organicKeyEvents: ga4Row?.keyEvents ?? 0,
      kwTracked: rank.tracked,
      kwTop3: rank.top3,
      kwTop10: rank.top10,
      kwTop20: rank.top20,
      kwTop100: rank.top100,
      kwAvgPosition: rank.avgPosition,
      visibilityScore,
    });
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'Seed script yalnız NODE_ENV=development ile çalışır (ARCHITECTURE §15).',
    );
  }

  const reset = process.argv.includes('--reset');
  const dataSource = new DataSource({
    type: 'postgres',
    url: requireDatabaseUrl(),
  });
  await dataSource.initialize();

  try {
    if (reset) {
      await resetOrg(dataSource, ORG_SLUG);
    }

    const ownerId = await upsertOwner(dataSource);
    const orgId = await upsertOrg(dataSource, ownerId);

    for (const client of CLIENTS) {
      const clientId = await upsertClient(dataSource, orgId, client.name);
      for (const project of client.projects) {
        const projectId = await upsertProject(dataSource, orgId, clientId, project);
        const keywordIds = await Promise.all(
          project.keywords.map((keyword) =>
            upsertTrackedKeyword(dataSource, orgId, projectId, keyword),
          ),
        );
        await seedProjectHistory(dataSource, orgId, projectId, keywordIds);
        // eslint-disable-next-line no-console
        console.log(`Proje işlendi: ${project.name} (${project.domain})`);
      }
    }

    // eslint-disable-next-line no-console
    console.log('\nSeed tamamlandı.');
    // eslint-disable-next-line no-console
    console.log(`Giriş: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
    // eslint-disable-next-line no-console
    console.log(`Org: ${ORG_NAME} (${ORG_SLUG})`);
  } finally {
    await dataSource.destroy();
  }
}

void main();
