# Mimari

## 1. Genel bakış

```
                +-------------------------------+
                |  Panel (Vite SPA)             |
                |  shadcn + TanStack            |
                +---------------+---------------+
                                | HTTPS /api/v1
                +---------------v---------------+
                |  API process (NestJS/Express) |
                |  auth, tenancy, CRUD, sorgu   |
                +------+----------------+-------+
                       |                |
            +----------v----+    +------v--------+
            | PostgreSQL 17 |    | Redis 7       |
            | + pgvector    |    | BullMQ        |
            | + pg_partman  |    +------+--------+
            +----------^----+           |
                       |                |
                +------+----------------v-------+
                |  Worker process (NestJS ctx)  |
                |  sync, rank, summary, alert,  |
                |  report, (crawl, audit, ai)   |
                +---------------+---------------+
                                |
          +---------------------+----------------------+
          |              |              |              |
     Search Console    GA4 Data     DataForSEO    (Faz 3: Claude,
         API             API           API        WordPress, GitHub)
```

## 2. Process modeli

| Process | Entrypoint | Görev |
|---|---|---|
| api | `src/main.ts` → `AppModule` | HTTP API. Kuyruğa job ekler, job çalıştırmaz |
| worker | `src/worker.ts` → `WorkerModule` | BullMQ processor'ları. `SCHEDULER_ENABLED=true` ise bakım cron'ları |
| panel | Vite | Statik SPA. Dev'de `/api` isteklerini `:3000`'e proxy'ler |

`WorkerModule` domain modüllerini (service'leri) import eder, processor'ları kaydeder, HTTP katmanını yüklemez.

İleride worker'ları ayırmak için `WORKER_QUEUES` env'i kullanılır, örneğin `gsc-sync,ga4-sync`. Boşsa tüm kuyruklar aynı process'te çalışır. Faz 1'de tek worker yeterli.

## 3. Modül haritası

```
src/
  common/            guards, decorators, filters, interceptors, pagination, base entities
  config/            env şeması, config factory'leri
  database/          data-source.ts, migrations/, naming strategy
  infra/
    crypto/          CryptoService (AES-256-GCM)
    queue/           BullMQ root config, queue isimleri, dispatcher yardımcıları
    mail/            MailService (SMTP)
    storage/         StorageService (Faz 1 local disk, sonra S3 uyumlu)
  connectors/
    gsc/             GscClient
    ga4/             Ga4Client
    dataforseo/      DataForSeoClient
  modules/
    auth/            Faz 1
    users/           Faz 1
    organizations/   Faz 1 (organizations, memberships, tenancy)
    clients/         Faz 1
    projects/        Faz 1
    connections/     Faz 1 (GSC/GA4 bağlantıları, doğrulama)
    gsc/             Faz 1 (sync, sorgu endpoint'leri)
    ga4/             Faz 1
    keywords/        Faz 1 (gruplar, takip listesi)
    rankings/        Faz 1 (rank task, rank_daily, latest)
    usage/           Faz 1 (api_usage)
    summaries/       Faz 1 (project_daily_summary)
    alerts/          Faz 1 (kural, değerlendirme, bildirim)
    reports/         Faz 1 (rapor verisi, PDF)
    jobs/            Faz 1 (job_runs, manuel tetikleme, durum)
    housekeeping/    Faz 1 (@nestjs/schedule bakım işleri)
    crawler/         Faz 2
    audit/           Faz 2
    automation/      Faz 2
    competitors/     Faz 2
    integrations/    Faz 3 (wordpress, github)
    ai/              Faz 3
    mcp/             Faz 3
```

`connectors/` iş mantığı içermez. Sadece dış API'yi tipli şekilde sarar, hata ve yeniden deneme davranışını standartlaştırır, maliyeti `UsageService`'e bildirir.

## 4. Tenancy ve yetkilendirme

### 4.1 Hiyerarşi

```
organization
  ├─ membership (user + role [+ client_id])
  └─ client
       └─ project (tek domain)
            ├─ connection (gsc, ga4)
            ├─ keyword_group
            ├─ tracked_keyword
            ├─ alert_rule
            └─ report
```

### 4.2 Roller

| Yetki | owner | admin | analyst | client_viewer |
|---|---|---|---|---|
| Org ayarları, üyeler, silme | ✓ | | | |
| Üye davet ve rol değiştirme | ✓ | ✓ | | |
| Client/project oluşturma ve silme | ✓ | ✓ | | |
| Bağlantılar (GSC/GA4) | ✓ | ✓ | | |
| Keyword, alert, rapor yönetimi | ✓ | ✓ | ✓ | |
| Veri görüntüleme | ✓ | ✓ | ✓ | Sadece kendi client'ı |
| Rapor görüntüleme | ✓ | ✓ | ✓ | Sadece kendi client'ı |

`client_viewer` üyeliğinde `client_id` zorunludur. Bu rol sadece o client'ın projelerini görür, yazma yetkisi yoktur.

### 4.3 Request akışı

```
JwtAuthGuard  → access token doğrula, user'ı CLS'e yaz
TenantGuard   → X-Org-Id header'ını oku, membership'i doğrula (Redis cache 60 sn),
                orgId, role ve clientScope'u CLS'e yaz
RolesGuard    → @Roles(...) dekoratörünü kontrol et
ProjectAccess → :projectId içeren route'larda projenin bu org'a ait olduğunu
                ve client_viewer ise kendi client'ında olduğunu doğrula
```

Dekoratörler: `@Public()`, `@Roles()`, `@CurrentUser()`, `@CurrentOrg()`, `@SkipTenant()` (org seçimi gerektirmeyen endpoint'ler için, örneğin `/me`, `/organizations`).

Tenant scope'u repository seviyesinde de zorlanır. `TenantRepository<T>` base'i, CLS'teki `orgId` ile her `find*`, `update` ve `delete` işlemine `org_id` şartını ekler. CLS'te `orgId` yoksa istisna fırlatır.

### 4.4 Auth

- Şifre hash'i: argon2id.
- Access token: JWT, 15 dakika, `Authorization: Bearer`.
- Refresh token: opak rastgele değer, 30 gün, DB'de hash'i tutulur. Rotation uygulanır: her kullanımda yenisi üretilir, eskisi `replaced_by` ile işaretlenir. İptal edilmiş bir token tekrar kullanılırsa o token ailesinin tamamı iptal edilir.
- Refresh token panelde httpOnly, Secure, SameSite=Lax cookie olarak tutulur, path `/api/v1/auth`. Dev'de Vite proxy sayesinde aynı origin'de çalışır.
- Rate limit: `@nestjs/throttler`, Redis storage ile. Login ve refresh endpoint'lerinde sıkı limit uygulanır.
- Davet akışı: owner veya admin davet oluşturur, token'lı link mail ile gider, kabul edilince membership oluşur.

## 5. Veri modeli (Faz 1)

Tüm tablolarda `created_at` ve `updated_at` (timestamptz) bulunur. Aksi belirtilmedikçe PK `id uuid` (UUIDv7).
`org_id` olan tablolarda `(org_id)` ya da `(org_id, ...)` ile başlayan index vardır.

### 5.1 Kimlik ve tenancy

**users**
`id, email (unique, lower), password_hash, name, is_active, last_login_at`

**refresh_tokens**
`id, user_id, family_id, token_hash (unique), expires_at, revoked_at, replaced_by_id, user_agent, ip`

**organizations**
`id, name, slug (unique), settings jsonb`
(`settings`: timezone, varsayılan dil, rapor markalaması)

**memberships**
`id, org_id, user_id, role (enum), client_id (nullable), invited_by`
unique `(org_id, user_id)`

**invitations**
`id, org_id, email, role, client_id, token_hash, expires_at, accepted_at, invited_by`

**audit_logs**
`id, org_id, user_id, action, entity_type, entity_id, changes jsonb, ip, created_at`

### 5.2 Müşteri ve proje

**clients**
`id, org_id, name, contact_emails text[], notes, branding jsonb, is_active`

**projects**
`id, org_id, client_id, name, domain (lower, protokolsüz), country_code, language_code, dfs_location_code int, dfs_language_code, timezone, status (active/paused/archived)`
unique `(org_id, domain)`

**connections**
`id, org_id, project_id, type (gsc/ga4), external_id, auth_type (service_account/oauth), credentials_encrypted text (nullable), status (pending/active/error/revoked), last_verified_at, last_synced_at, last_error, backfill_status (pending/running/done/failed), backfill_progress jsonb`
unique `(project_id, type)`

- `external_id`: GSC için `sc-domain:example.com` ya da `https://example.com/`, GA4 için `properties/123456789`.
- `auth_type = service_account` olduğunda `credentials_encrypted` boştur, sistemin kendi service account'u kullanılır (env).

### 5.3 GSC

**gsc_site_daily** (partition yok, küçük tablo)
`date, org_id, project_id, clicks, impressions, ctr, position`
PK `(project_id, date)`
Kaynak: `dimensions: [date]`. Anonimleştirilmiş sorgular dahil doğru site toplamını tutar.

**gsc_page_daily** (aylık partition)
`date, org_id, project_id, page, page_hash, device, country, clicks, impressions, ctr, position`
PK `(date, project_id, page_hash, device, country)`

**gsc_daily** (aylık partition)
`date, org_id, project_id, query, query_hash, page, page_hash, country, device, clicks, impressions, ctr, position`
PK `(date, project_id, query_hash, page_hash, country, device)`

- Hash kolonları `md5(text)` değeridir (char(32)). Uzun metinleri PK'ya koymamak için kullanılır.
- `country` ISO alpha-3 küçük harf (GSC formatı), `device` desktop/mobile/tablet.
- `query` kolonunda `gin_trgm_ops` index'i bulunur (keyword arama).

Query boyutlu verinin toplamı site toplamından düşüktür, çünkü GSC anonim sorguları gizler. Dashboard toplamları `gsc_site_daily`'den, sayfa toplamları `gsc_page_daily`'den, sorgu detayları `gsc_daily`'den okunur. Bu ayrım bozulmamalı.

### 5.4 GA4

**ga4_daily** (aylık partition)
`date, org_id, project_id, landing_page, landing_page_hash, channel_group, sessions, engaged_sessions, key_events, total_revenue numeric(14,2)`
PK `(date, project_id, landing_page_hash, channel_group)`

Faz 1'de tüm kanallar çekilir. Organik analiz için `channel_group = 'Organic Search'` filtresi sorgu tarafında uygulanır.

### 5.5 Keyword ve rank

**keyword_groups**
`id, org_id, project_id, name, color`

**tracked_keywords**
`id, org_id, project_id, group_id (nullable), keyword, keyword_normalized, device (desktop/mobile), location_code int, language_code, frequency (daily/weekly), depth smallint (varsayılan 20), target_url (nullable), tags text[], is_active`
unique `(project_id, keyword_normalized, device, location_code, language_code)`
`keyword_normalized`: lower + trim + birden fazla boşluğu teke indirme.

**rank_tasks**
`id, org_id, project_id, tracked_keyword_id, check_date date, provider_task_id, status (posted/ready/fetched/failed), posted_at, fetched_at, attempts, error`
unique `(tracked_keyword_id, check_date)`

**rank_daily** (aylık partition)
`date, org_id, project_id, tracked_keyword_id, position smallint null, rank_absolute smallint null, url text null, serp_features text[], competitors_top jsonb, checked_at, source (dfs_standard/dfs_live)`
PK `(date, tracked_keyword_id)`
- `position`: organik sıra (`rank_group`). Bulunamazsa null, yani depth dışı.
- `competitors_top`: ilk 10'daki domain ve pozisyon listesi. Faz 2 rakip analizine veri sağlar.

**keyword_rank_latest** (denormalize, hızlı tablo görünümü için)
`tracked_keyword_id (PK), org_id, project_id, position, url, previous_position, change_1d, change_7d, change_30d, best_position, sparkline smallint[] (son 30 gün), updated_at`

### 5.6 Özet, kullanım, job

**project_daily_summary**
`date, org_id, project_id, gsc_clicks, gsc_impressions, gsc_ctr, gsc_position, organic_sessions, organic_key_events, kw_tracked, kw_top3, kw_top10, kw_top20, kw_top100, kw_avg_position, visibility_score numeric`
PK `(project_id, date)`
- `visibility_score`: takip edilen keyword'lerin pozisyonuna göre CTR eğrisiyle ağırlıklandırılmış skor (0-100).

**api_usage**
`id, org_id (nullable), project_id (nullable), provider (dataforseo/gsc/ga4/anthropic), endpoint, units int, cost numeric(12,6), job_run_id, created_at`
Index: `(org_id, created_at)`, `(provider, created_at)`.

**job_runs**
`id, org_id, project_id (nullable), type, status (queued/running/succeeded/failed), trigger (schedule/manual/system), bullmq_job_id, started_at, finished_at, stats jsonb, error`

Panelde "son senkron", "hata", "backfill ilerlemesi" gibi bilgiler buradan okunur.

### 5.7 Alert ve rapor

**alert_rules**
`id, org_id, project_id, name, type (rank_drop/rank_exit/traffic_drop/sync_failure), config jsonb, channels jsonb, is_active, cooldown_hours (varsayılan 24)`

**alert_events**
`id, org_id, project_id, rule_id, dedupe_key, payload jsonb, severity, triggered_at, notified_at, notify_error`
unique `(rule_id, dedupe_key)` + cooldown kontrolü.

**notification_channels** (org seviyesinde)
`id, org_id, type (email/discord/slack), name, config_encrypted text`
(Webhook URL'leri de secret sayılır, şifreli tutulur.)

**reports**
`id, org_id, project_id, type (weekly/monthly/custom), period_start, period_end, status (queued/rendering/ready/failed), file_key, file_size, generated_at, sent_at, sent_to text[], error, created_by`

**report_schedules**
`id, org_id, project_id, type, cron, timezone, recipients text[], is_active`

## 6. Partition yönetimi

Aylık range partition kullanan tablolar: `gsc_daily`, `gsc_page_daily`, `ga4_daily`, `rank_daily`.

Migration örneği:

```sql
CREATE TABLE gsc_daily (
  date        date        NOT NULL,
  org_id      uuid        NOT NULL,
  project_id  uuid        NOT NULL,
  query       text        NOT NULL,
  query_hash  char(32)    NOT NULL,
  page        text        NOT NULL,
  page_hash   char(32)    NOT NULL,
  country     varchar(3)  NOT NULL,
  device      varchar(10) NOT NULL,
  clicks      integer     NOT NULL,
  impressions integer     NOT NULL,
  ctr         real        NOT NULL,
  position    real        NOT NULL,
  PRIMARY KEY (date, project_id, query_hash, page_hash, country, device)
) PARTITION BY RANGE (date);

SELECT partman.create_parent(
  p_parent_table := 'public.gsc_daily',
  p_control      := 'date',
  p_interval     := '1 month',
  p_premake      := 3,
  p_start_partition := '2024-01-01'
);

CREATE INDEX ON gsc_daily (project_id, date);
CREATE INDEX ON gsc_daily USING gin (query gin_trgm_ops);
```

- `p_start_partition`: GSC geçmişi 16 ay geriye gider. Backfill için başlangıç partition'ı buna göre ayarlanır.
- Bakım: `housekeeping` modülü günde bir kez `CALL partman.run_maintenance_proc()` çalıştırır (`@nestjs/schedule`, sadece scheduler worker'da).
- Retention yok, veri silinmez. Uzun dönem trend analizi ürünün bir özelliği.
- TypeORM entity'si normal tablo gibi tanımlanır. Partition'lardan haberi olmaz.

## 7. Kuyruklar

| Kuyruk | Üretici | Concurrency | Limiter | Retry |
|---|---|---|---|---|
| `dispatch` | Job Scheduler | 1 | yok | 3, exponential |
| `gsc-sync` | dispatch, manuel, backfill | 4 | 10 istek/sn (global) | 5, exponential 30 sn |
| `gsc-backfill` | connection doğrulandığında | 2 | gsc-sync ile aynı client limiti | 5 |
| `ga4-sync` | dispatch, manuel | 4 | 5 istek/sn | 5 |
| `rank-post` | dispatch | 2 | yok | 3 |
| `rank-poll` | Job Scheduler (2 dk) | 1 | yok | 3 |
| `rank-fetch` | rank-poll | 8 | 20 istek/sn | 5 |
| `summary` | sync ve rank job'larının bitişi | 4 | yok | 3 |
| `alert-eval` | summary bitişi, sync hatası | 4 | yok | 3 |
| `notify` | alert-eval, rapor | 4 | yok | 5 |
| `report` | report_schedules, manuel | 2 | yok | 2 |

Kurallar:
- Kuyruk isimleri ve job data tipleri `infra/queue/queues.ts` içinde tek yerde tanımlanır.
- **Job data her zaman `{ orgId, projectId?, ...}` içerir.** Processor başında `cls.run()` ile tenant context kurulur.
- Tamamlanan job'lar `removeOnComplete: { age: 86400, count: 1000 }`, başarısızlar `removeOnFail: { age: 604800 }` ile temizlenir. Kalıcı geçmiş `job_runs` tablosunda.
- **Tenant adaleti:** OSS BullMQ'da gruplar yok. Tek bir org'un yüzlerce job'u diğerlerini kilitlemesin diye dispatch, projeleri sırayla (round-robin) kuyruğa ekler. Backfill job'ları düşük öncelikle (`priority: 10`) eklenir, günlük sync'ler yüksek öncelikle (`priority: 1`).
- **Redis `maxmemory-policy noeviction` olmalı.** BullMQ key'lerinin silinmesi job kaybı demek.

Dev ortamında kuyrukları görmek için bull-board `/admin/queues` altında, sadece `NODE_ENV=development` iken açılır.

## 8. Zamanlama

### 8.1 Tenant işleri: BullMQ Job Scheduler

Worker açılışında `upsertJobScheduler` ile kaydedilir:

| Scheduler | Pattern (UTC) | İş |
|---|---|---|
| `daily-dispatch` | `0 4 * * *` | Aktif projeler için gsc-sync, ga4-sync, rank-post (daily keyword'ler) job'larını ekler |
| `weekly-dispatch` | `0 4 * * 1` | Haftalık keyword'ler için rank-post |
| `rank-poll` | her 2 dakika | DataForSEO `tasks_ready` kontrolü |
| `report-dispatch` | `0 * * * *` | Zamanı gelen `report_schedules` kayıtları için report job'u |

Dispatcher deterministik jobId kullanır: `gsc-sync:{projectId}:{YYYY-MM-DD}`. Aynı gün ikinci kez tetiklenirse BullMQ aynı id'li job'u tekrar eklemez.

Proje timezone'u raporlarda ve "gün" tanımında kullanılır. Sync zamanlaması Faz 1'de global UTC saatinde yapılır.

### 8.2 Sistem bakımı: `@nestjs/schedule`

`housekeeping` modülü, sadece `SCHEDULER_ENABLED=true` olduğunda yüklenir:

| Cron | İş |
|---|---|
| Günlük 03:00 | `partman.run_maintenance_proc()` |
| Günlük 03:30 | Süresi dolmuş ya da iptal edilmiş refresh token'ları ve süresi geçmiş davetleri sil |
| Haftalık | 90 günden eski `job_runs` kayıtlarını sil |
| Saatlik | `status = running` iken 2 saatten uzun süredir takılı kalmış `job_runs` kayıtlarını `failed` yap |

## 9. Connector'lar

### 9.1 Search Console

- **Kütüphane:** `googleapis` (`searchconsole` v1).
- **Auth, Faz 1:** Sistemin tek bir service account'u var (JSON, env'den base64). Kullanıcı panelde gösterilen service account e-postasını Search Console property'sine kullanıcı olarak ekler. OAuth Faz 4'te gelecek.
- **Doğrulama:** `sites.list` çağrılır, `external_id` listede ve yetki seviyesi yeterli mi kontrol edilir. Sonuç `connections.status`'a yazılır.
- **Günlük sync (`gsc-sync`)**, hedef tarih aralığı son 5 gündür. GSC verisi 2-3 gün gecikmeli kesinleşir, son günler her seferinde tekrar yazılır. Her gün için sırayla:
  1. `dimensions: ['date']` → `gsc_site_daily`
  2. `dimensions: ['date','page','device','country']` → `gsc_page_daily`
  3. `dimensions: ['date','query','page','device','country']` → `gsc_daily`
- **Sayfalama:** `rowLimit: 25000`, boş dönene kadar `startRow` artırılır. `dataState: 'all'` kullanılır.
- **Yazma:** 1000'lik batch'ler halinde `INSERT ... ON CONFLICT DO UPDATE`.
- **Backfill (`gsc-backfill`):** Connection aktif olunca 16 ay geriye gün gün job'lar düşük öncelikle eklenir. İlerleme `connections.backfill_progress`'a yazılır (`{ from, to, done, total }`).
- **Hata yönetimi:** 429 ve 5xx hatalarında exponential backoff. 403 gelirse connection `error` durumuna çekilir ve `sync_failure` alert'i tetiklenir.

### 9.2 GA4

- **Kütüphane:** `@google-analytics/data` (`BetaAnalyticsDataClient.runReport`).
- **Auth:** Aynı service account, GA4 property'sine Viewer olarak eklenir.
- **Doğrulama:** Property için 1 günlük basit bir rapor çekilir.
- **Günlük sync:** son 3 gün.
  - Dimensions: `date`, `landingPagePlusQueryString`, `sessionDefaultChannelGroup`
  - Metrics: `sessions`, `engagedSessions`, `keyEvents`, `totalRevenue`
  - `limit: 100000`, `offset` ile sayfalama.
- **Backfill:** 14 ay (GA4 standart veri saklama süresine bağlı, property ayarına göre değişir).
- Metrik isimleri GA4 API'sinde değişebiliyor. İsimler connector içinde sabit olarak tek yerde tutulur.

### 9.3 DataForSEO

- **Auth:** Basic auth (`DFS_LOGIN`, `DFS_PASSWORD`).
- **Rank tracking akışı (Standard queue):**
  1. `rank-post`: Proje için bugün kontrol edilecek keyword'ler alınır. `rank_tasks`'ta aynı `(keyword, date)` varsa atlanır. `serp/google/organic/task_post` ile tek istekte en fazla 100 task gönderilir. Her task'ın `tag` alanına `tracked_keyword_id` yazılır. Parametreler: `keyword`, `location_code`, `language_code`, `device`, `depth`. Dönen task id'leri `rank_tasks`'a `posted` olarak yazılır.
  2. `rank-poll`: `serp/google/organic/tasks_ready` çağrılır, hazır task'lar için `rank-fetch` job'u eklenir.
  3. `rank-fetch`: `serp/google/organic/task_get/advanced/{id}` ile sonuç alınır. Organik item'larda proje domain'i aranır (subdomain dahil, `www` normalize edilir). İlk eşleşmenin `rank_group` değeri `position`, `rank_absolute` değeri `rank_absolute` olarak yazılır. `url`, `serp_features` ve `competitors_top` doldurulur. `rank_daily`'ye upsert yapılır, `rank_tasks` `fetched` olur.
  4. Proje için günün tüm task'ları bitince `summary` job'u tetiklenir.
- **Anlık kontrol:** Panelde "şimdi kontrol et" butonu `task_get/live` ile çalışır. Kullanıcı başına rate limit uygulanır, `source = dfs_live` olarak yazılır.
- **Maliyet:** Her response'taki `cost` alanı `api_usage`'a yazılır.
- **Postback:** Faz 1'de kullanılmaz (public URL gerektiriyor), polling yeterli. Deploy sonrası `postback_url` ile polling kaldırılabilir.
- **Takılan task'lar:** 24 saat içinde `ready` olmayan task'lar `failed` işaretlenir ve bir sonraki dispatch'te yeniden gönderilir.

## 10. Özetler

`summary` job'u proje ve tarih bazında çalışır:
1. `project_daily_summary` satırını GSC, GA4 ve rank tablolarından hesaplar, upsert eder.
2. Rank verisi değiştiyse ilgili keyword'lerin `keyword_rank_latest` satırlarını günceller: değişimler, en iyi pozisyon, sparkline.
3. Bitince `alert-eval` job'unu tetikler.

Panelin dashboard ve keyword tablosu sadece bu özet tablolarını okur. Ham tablolar sadece GSC explorer ve detay ekranlarında, tarih aralığı ve sayfalama ile sorgulanır.

## 11. Alertler (Faz 1)

| Tip | Config | Tetik |
|---|---|---|
| `rank_drop` | `{ groupId?, keywordIds?, minDrop: 3, fromTop: 10 }` | Keyword X sıradan fazla düştü ve önceki pozisyonu top N içindeydi |
| `rank_exit` | `{ groupId?, top: 10, days: 3 }` | Keyword N gündür top N dışında |
| `traffic_drop` | `{ metric: 'clicks' \| 'sessions', pct: 25, window: 7 }` | Son 7 gün, önceki 7 güne göre %X düştü |
| `sync_failure` | `{}` | Connection `error` durumuna geçti ya da sync 2 kez üst üste başarısız oldu |

- **Dedupe:** `dedupe_key` alanıyla (ör. `rank_drop:{keywordId}:{date}`) ve `cooldown_hours` ile. Aynı olay cooldown süresi içinde tekrar bildirilmez.
- **Bildirim kanalları:** e-posta (SMTP, nodemailer), Discord webhook, Slack webhook. Kanallar org seviyesinde tanımlanır, kural hangi kanallara gideceğini seçer.
- Faz 2'de alert kuralları genel otomasyon motoruna (trigger, condition, action) taşınacak. Faz 1 tablolarını bu geçişi kolaylaştıracak şekilde sade tut.

## 12. Raporlar

1. Rapor kaydı oluşturulur (manuel ya da schedule), `report` job'u kuyruğa girer.
2. Worker kısa ömürlü bir rapor token'ı üretir: JWT, 10 dakika, scope `report:{id}`, sadece rapor verisi endpoint'ine erişebilir.
3. Playwright (chromium) `${PANEL_URL}/print/reports/{id}?token=...` sayfasını açar.
4. Panel `/print/reports/:id` route'u layout'suz render edilir, veriyi `GET /api/v1/reports/{id}/data` (token ile) üzerinden çeker. Tüm grafikler çizilince `data-report-ready="true"` işaretini koyar.
5. Worker bu işareti bekler, `page.pdf({ format: 'A4', printBackground: true })` ile PDF'i üretir, `StorageService`'e yazar, `reports.status = ready` olur.
6. Alıcı tanımlıysa `notify` job'u PDF ekli maili gönderir.

**Rapor içeriği (Faz 1):**
- Kapak (client markalaması)
- Dönem özeti: tıklama, gösterim, organik oturum, ortalama pozisyon (önceki dönemle karşılaştırmalı)
- GSC trend grafiği
- Keyword pozisyon dağılımı ve en çok yükselen/düşen keyword'ler
- En çok trafik alan sayfalar
- Analist notu alanı (rapor oluşturulurken elle girilir; Faz 3'te AI taslağı)

Dev ortamında `PANEL_URL=http://localhost:5173`. Worker'ın panel dev server'ına erişebilmesi yeterli.

## 13. Güvenlik

- **Helmet**, CORS'ta sadece `PANEL_ORIGIN` izinli.
- **ValidationPipe:** `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- **Şifreleme:** Secret'lar `CryptoService` ile şifrelenir. Format `v1:{iv}:{tag}:{ciphertext}` (base64). Önek key rotation'a izin verir.
- **Audit:** Üye, rol, connection ve silme işlemleri `audit_logs`'a yazılır.
- **Hata mesajları:** Response'ta stack trace ve dış API hata gövdesi dönülmez, sadece log'a yazılır.
- **Faz 2 crawler için not:** Kullanıcının girdiği URL'ler private IP aralıklarına, localhost'a ve metadata endpoint'lerine gidemez (SSRF koruması).

## 14. Ortam değişkenleri

```
NODE_ENV=development
PORT=3000
API_PREFIX=/api/v1
PANEL_ORIGIN=http://localhost:5173
PANEL_URL=http://localhost:5173

DATABASE_URL=postgres://seo:seo@localhost:5432/seo
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=
JWT_ACCESS_TTL=900
REFRESH_TOKEN_TTL_DAYS=30
REPORT_TOKEN_SECRET=

ENCRYPTION_KEY=              # 32 byte, base64
ENCRYPTION_KEY_VERSION=v1

GOOGLE_SA_JSON_BASE64=       # service account JSON, base64
DFS_LOGIN=
DFS_PASSWORD=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=

STORAGE_DIR=./storage
SCHEDULER_ENABLED=true
WORKER_QUEUES=
```

## 15. Lokal geliştirme

- `docker compose up -d postgres redis`: Postgres custom image'ı (pgvector + pg_partman) ve Redis ayağa kalkar. Portlar sadece `127.0.0.1`'e bağlanır.
- API, worker ve panel host üzerinde ayrı terminallerde çalışır.
- Vite `server.proxy` ayarı: `/api` → `http://localhost:3000`. Panel ve API aynı origin'de görünür, refresh cookie sorunsuz çalışır.
- Seed script'i (`bun run --filter api seed`) şunları oluşturur: bir owner kullanıcı, bir org, iki client, üç proje, örnek keyword'ler. GSC ve GA4 bağlantısı olmadan panel çalışabilsin diye 60 günlük sahte veri de ekler.

## 16. Sonraki fazlar için ayrılmış tasarım notları

- **pgvector (Faz 3):** `page_embeddings (project_id, url, content_hash, embedding vector(1024), model)` ve `keyword_embeddings`. HNSW index `vector_cosine_ops`. Keyword clustering, iç link önerisi ve cannibalization tespiti için kullanılacak.
- **Onay akışı (Faz 3):** AI ya da otomasyonun önerdiği her değişiklik `change_requests` tablosuna düşer (pending/approved/rejected/applied). WordPress'e draft ya da GitHub'a PR olarak uygulanması sadece onaydan sonra yapılır.
- **Otomasyon motoru (Faz 2):** Event kataloğu `rank.dropped`, `gsc.anomaly`, `crawl.new_404`, `audit.critical`, `page.deindexed`. Kural yapısı trigger, condition, action. Faz 1'deki `alert_rules` buraya migrate edilecek.
