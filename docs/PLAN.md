# Faz Planı

Her görev tek bir Claude Code oturumunda bitecek büyüklükte tasarlandı. Sırayla ilerle. Bir görevin kabul kriterleri sağlanmadan sonrakine geçme.
Tamamlanan görevi `[x]` ile işaretle. Kapsamda değişiklik olduysa görevin altına kısa not düş.

---

## Faz 0: İskelet

Amaç: Boş ama çalışan, kuralları yerinde bir monorepo. Bu fazın sonunda hiçbir iş özelliği yok ama her şeyin oturacağı altyapı hazır.

### [x] T0.1 Monorepo ve uygulama iskeletleri
- Root `package.json`: Bun workspaces (`apps/*`), root script'leri (CLAUDE.md'deki komut listesi).
- `apps/api`: `@nestjs/cli` ile Nest 11 projesi, Express adapter, TypeScript strict, jest.
- `apps/panel`: Vite + React + TypeScript şablonu.
- Ortak: `.editorconfig`, `.gitignore`, ESLint + Prettier (her app kendi config'i), `tsconfig` ayrı.
- `trustedDependencies` listesi (argon2, sharp, `@nestjs/core` ve ihtiyaç çıkarsa diğerleri).

**Kabul:**
- `bun install` hatasız.
- `bun run dev:api` ve `bun run dev:panel` ayağa kalkıyor.
- `bun run lint` ve `bun run typecheck` iki app için de geçiyor.

**Not:** `dev:worker` (T0.5), `db:migrate` (T0.4) ve `gen:api` (T0.7) bu görevde eklenmedi; ilgili görevlerde eklenecek.

### [x] T0.2 Lokal altyapı
- `docker/postgres/Dockerfile` (pgvector + pg_partman) ve `docker-compose.yml` (postgres, redis). Portlar `127.0.0.1`'e bağlı.
- Redis: `appendonly yes`, `maxmemory-policy noeviction`.
- `.env.example` (ARCHITECTURE.md §14).

**Kabul:**
- `bun run db:up` sonrası `psql` ile bağlanılıyor.
- `SELECT * FROM pg_available_extensions WHERE name IN ('vector','pg_partman','pg_trgm','unaccent')` dört satır dönüyor.

**Not:** Docker doğrulaması runner'da yapılamadı; kullanıcı lokalde db:up ve extension sorgusunu (4 satır) doğruladı.

### [x] T0.3 API çekirdeği
- `ConfigModule`: env şeması class-validator ile. Eksik env'de açılış hatası ve anlaşılır mesaj.
- Global: `ValidationPipe` (whitelist, forbidNonWhitelisted, transform), exception filter (`{ error: { code, message, details } }`), `helmet`, CORS (`PANEL_ORIGIN`), `/api/v1` prefix.
- `nestjs-cls` kurulumu. Request başına `requestId` üretilir, loglara eklenir.
- `@nestjs/swagger` CLI plugin. `/api/docs` (sadece dev) ve `scripts/export-openapi.ts` (spec'i `apps/api/openapi.json`'a yazar).
- `GET /api/v1/health`: DB ve Redis kontrolü.

**Kabul:**
- Health endpoint DB ve Redis durumunu dönüyor.
- `bun run --filter api openapi:export` geçerli bir spec üretiyor.
- Geçersiz body ile istek atıldığında standart hata gövdesi dönüyor.

### [ ] T0.4 Veritabanı katmanı
- `database/data-source.ts` (CLI ve uygulama için ortak config), `SnakeNamingStrategy`, `synchronize: false`, `migrationsRun: false`.
- Base entity'ler: `BaseEntity` (id UUIDv7, created_at, updated_at), `TenantScopedEntity` (+ org_id).
- `TenantRepository<T>`: CLS'teki orgId'yi zorunlu kılan, tüm sorgulara `org_id` şartı ekleyen base repository. CLS'te orgId yoksa `TenantContextMissingError`.
- Migration script'leri (generate, create, run, revert).
- İlk migration: `vector`, `pg_trgm`, `unaccent` extension'ları, `partman` şeması ve `pg_partman` extension'ı.

**Kabul:**
- `bun run db:migrate` temiz bir veritabanında çalışıyor, `revert` geri alıyor.
- `TenantRepository` için unit test: orgId yokken hata, varken sorguya şart ekleniyor.

### [ ] T0.5 Kuyruk altyapısı ve worker
- `@nestjs/bullmq` root config (`REDIS_URL`).
- `infra/queue/queues.ts`: kuyruk isimleri, job data tipleri, varsayılan job ayarları (removeOnComplete, removeOnFail, attempts, backoff).
- `src/worker.ts` + `WorkerModule`: `createApplicationContext`, graceful shutdown (SIGTERM'de aktif job'ları bitir).
- `BaseProcessor` yardımcısı: job data'dan `orgId`'yi alıp `cls.run` içinde işi çalıştırır, `job_runs` kaydını açar ve kapatır (tablo T1.x'te gelir, şimdilik interface).
- Dev için bull-board, `/admin/queues`, sadece development'ta.
- Örnek bir `ping` kuyruğu ve processor'ı (sonra silinecek).

**Kabul:**
- `bun run dev:worker` açılıyor.
- API'den eklenen ping job'u worker'da işleniyor, bull-board'da görünüyor.

**Lokal doğrulama bekliyor:** Runner'da Redis yok; sandbox'ta `dev:worker`'ın
açıldığı ve `WORKER_QUEUES` filtresinin doğru modülleri yüklediği doğrulandı
(bkz. `worker.module.spec.ts` ve manuel çalıştırma), ama gerçek bir job'un
worker'da işlenmesi ve bull-board'da görünmesi doğrulanamadı. Lokalde:
1. `bun run db:up` (Redis ayağa kalksın).
2. `bun run dev:api` ve ayrı bir terminalde `bun run dev:worker`.
3. `ping` kuyruğu T1.5'te silindi; yerine aktif GSC bağlantısı olan bir
   projede `POST /api/v1/projects/:id/sync/gsc` çağır.
4. Worker log'unda job'un başladığını, `http://localhost:3000/admin/queues`'ta
   `gsc-sync` kuyruğunda tamamlanan job'u kontrol et.

### [x] T0.6 Ortak altyapı servisleri
- `CryptoService`: AES-256-GCM, `v1:` önekli format, encrypt/decrypt, unit test.
- `MailService`: nodemailer, dev'de console transport seçeneği.
- `StorageService`: local disk (`STORAGE_DIR`), interface S3'e geçişe uygun (`put`, `get`, `delete`, `getStream`).
- `@nestjs/event-emitter` kurulumu.
- `@nestjs/schedule` kurulumu, sadece `SCHEDULER_ENABLED=true` iken `HousekeepingModule`'ü yükleyecek koşullu modül yapısı.

**Kabul:** Crypto testleri geçiyor (şifrele, çöz, farklı IV, bozuk veri hatası).

**Lokal doğrulama bekliyor:** Runner'da Redis yok. `SCHEDULER_ENABLED=true` ile
`dev:worker` çalıştırılıp `HousekeepingModule`, `CryptoModule`, `MailModule` ve
`StorageModule`'ün hatasız yüklendiği manuel doğrulandı ("Worker başladı" log'u
görüldü), ama gerçek Redis bağlantısıyla `ScheduleModule`'ün cron'ları
kaydettiği ve worker kapanışının sorunsuz olduğu doğrulanamadı. Lokalde:
1. `bun run db:up` (Redis ayağa kalksın).
2. `.env`'de `SCHEDULER_ENABLED=true` ile `bun run dev:worker` çalıştır, hata
   olmadan açıldığını doğrula.

### [x] T0.7 Panel iskeleti
- Tailwind + shadcn/ui kurulumu (temel bileşenler: button, input, form, dialog, dropdown-menu, table, card, badge, tabs, toast, sheet, skeleton, select, popover, calendar).
- TanStack Router (file-based), TanStack Query client, temel layout (sidebar, üst bar, içerik alanı), dark/light tema.
- Vite proxy: `/api` → `http://localhost:3000`.
- orval config: `apps/api/openapi.json` → `src/api/` (TanStack Query hook'ları, custom fetch mutator).
- Fetch mutator: Bearer token ekleme, 401'de refresh deneme (tek seferlik, kuyruklu), `X-Org-Id` header'ı.
- Health endpoint'ini çağıran örnek sayfa.

**Kabul:**
- `bun run gen:api` client'ı üretiyor.
- Panel health sonucunu gösteriyor.
- Tema değişimi çalışıyor.

**Lokal doğrulama bekliyor:** Runner'da Postgres/Redis olmadığı için `apps/api` gerçek dev sunucusu ayağa kaldırılamadı; health sayfası panel tarafında Vite proxy'sinin 502'si (API kapalı) ve gerçek `HealthResponseDto` şekliyle birebir mock bir sunucu (ok / kısmi arıza / tam arıza) ile doğrulandı. `bun run db:up` sonrası gerçek API'ye karşı da doğrulanmalı.

---

## Faz 1: Ajans çekirdeği (MVP)

Amaç: Mevcut müşteri domain'lerinin GSC, GA4 ve rank verisiyle takip edildiği, haftalık rapor ve uyarı üreten, kendi kullanımımıza hazır sistem.

### [x] T1.1 Kullanıcılar ve auth
- Tablolar: `users`, `refresh_tokens`.
- Endpoint'ler: `POST /auth/register` (sadece ilk kullanıcı ya da davetle), `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`.
- argon2id, JWT access (15 dk), refresh rotation ve reuse tespiti (ARCHITECTURE §4.4).
- `JwtAuthGuard` global, `@Public()` dekoratörü.
- Throttler (Redis storage): login ve refresh için sıkı limit.

**Kabul:**
- e2e: login, refresh ile yeni token, eski refresh token'ı tekrar kullanınca tüm ailenin iptal edilmesi, logout.
- Yanlış şifrede genel hata mesajı (kullanıcı var mı yok mu belli olmuyor).

**Not:** `POST /auth/register` şimdilik yalnız hiç kullanıcı yokken çalışır; davetle kayıt T1.2'de gelir.
e2e testi (`apps/api/test/auth.e2e-spec.ts`) migration'ları uygulanmış bir test DB'si ister ve
`E2E_DATABASE=true` ile açılır (komut dosyanın başında). Runner'da geçici bir Postgres ile
`CreateUsersAndRefreshTokens` migration'ı uygulandı/geri alındı, entity'lerle şema farkı olmadığı
doğrulandı ve e2e geçti. Bu sırada `DATABASE_SKIP_INITIALIZATION=false`'un `true` okunması
hatası (T0.4/T0.6'daki boolean env dönüşümü) düzeltildi.

**Lokal doğrulama bekliyor:** Runner'da Redis yok. Throttler'ın Redis storage'ı unit testte
(`buildThrottlerOptions`) ve limitler bellek içi storage ile HTTP testinde doğrulandı; gerçek Redis'e
karşı: `bun run db:up`, `bun run dev:api`, ardından aynı IP'den dakikada 6 kez
`POST /api/v1/auth/login` → 6.'sı 429 dönmeli ve `redis-cli --scan --pattern '*:default}:hits'` sayaç anahtarını göstermeli.
Docker Compose'daki Postgres 17 imajında `bun run db:migrate` ve e2e'nin de bir kez çalıştırılması önerilir.

### [x] T1.2 Organizasyonlar ve tenancy
- Tablolar: `organizations`, `memberships`, `invitations`, `audit_logs`.
- `TenantGuard` (X-Org-Id, Redis membership cache), `RolesGuard`, `@Roles`, `@CurrentOrg`, `@SkipTenant`.
- Endpoint'ler: org oluşturma, listeleme (kullanıcının üyelikleri), güncelleme; üye listeleme, rol değiştirme, çıkarma; davet oluşturma, kabul etme (mail ile link).
- `AuditService` ve kritik işlemlerde kayıt.
- **Tenant izolasyon e2e test altyapısı:** iki org, iki kullanıcı; bir org'un kullanıcısıyla diğerinin kaynaklarına erişim denenir. Her yeni kaynak bu teste eklenir.

**Kabul:**
- İzolasyon testi geçiyor.
- Rol matrisi (ARCHITECTURE §4.2) testlerle doğrulanıyor.
- Membership değiştiğinde cache invalidation çalışıyor.

**Not:** Endpoint'ler: `POST/GET /organizations` (`@SkipTenant`), `GET/PATCH/DELETE /organizations/current`,
`GET /members`, `PATCH/DELETE /members/:userId`, `POST/GET /invitations`, `DELETE /invitations/:id`,
`POST /invitations/preview` (public), `POST /invitations/accept` (oturumdaki mevcut kullanıcı) ve
`POST /auth/register-invited` (davetle yeni hesap). Org kapsamlı endpoint'ler org'u yalnız `X-Org-Id`'den alır.
Rol matrisi `ROLE_MATRIX` (`common/tenancy/org-role.ts`) olarak tek yerde; sonraki kartlar `@Roles(...ROLE_MATRIX.x)` kullanır.
Davet token'ı 7 gün geçerli, DB'de SHA-256 hash'i durur, tek kullanımlıktır. `client_id` kolonları var,
FK'leri T1.3'te `clients` ile eklenecek. `audit_logs` bilerek FK'siz (org silinince kayıt kalır).
İzolasyon testi: `apps/api/test/tenant-isolation.e2e-spec.ts`'teki `RESOURCES` listesine her yeni kaynak bir satır
olarak eklenir; yeni tenant tabloları `test/support/e2e-app.ts`'teki `TABLES`'a da eklenmeli.
Runner'da geçici bir Postgres 17 ile migration uygulandı/geri alındı, entity'lerle şema farkı olmadığı doğrulandı;
izolasyon ve organizasyon e2e'leri (`E2E_DATABASE=true`) bu DB'ye karşı geçti. Unit testler: TenantGuard, cache
invalidation, rol matrisi (HTTP, gerçek guard zinciri), davet servisi ve global guard sırası.

**Lokal doğrulama bekliyor:** Runner'da Redis yok; membership cache e2e'de bellek içi cache ile doğrulandı.
Gerçek Redis'e karşı: `bun run db:up`, `bun run dev:api`; bir org kapsamlı istekten sonra
`redis-cli --scan --pattern 'tenancy:membership:*'` anahtarı göstermeli (`TTL` ≤ 60), üyenin rolü değişince ya da
üye çıkarılınca anahtar silinmeli. `bun run db:migrate` ve e2e'nin Docker Compose'daki Postgres imajında
(pgvector/pg_partman'lı `InitExtensions` dahil) bir kez çalıştırılması önerilir.

### [x] T1.3 Client'lar ve projeler
- Tablolar: `clients`, `projects`.
- CRUD endpoint'leri, sayfalı listeler, arama.
- `ProjectAccessGuard`: `:projectId` route'larında org ve client_viewer kontrolü.
- Domain normalizasyonu (protokol, www ve sondaki slash atılır, lowercase).
- DataForSEO lokasyon ve dil kodları için statik referans listesi. Türkiye, İngiltere, ABD, Almanya, Kanada ve sık kullanılan diğerleri için bir JSON seed; tam liste endpoint'ten sonra çekilebilir.

**Kabul:**
- client_viewer sadece kendi client'ının projelerini görüyor.
- İzolasyon testine client ve project eklendi.

Guard zinciri artık JwtAuthGuard → TenantGuard → RolesGuard → `ProjectAccessGuard` (ARCHITECTURE §4.3); sıra
`app.module.spec.ts`'te doğrulanır. `memberships.client_id` ve `invitations.client_id`'nin FK'leri de bu migration'da
eklendi (T1.2'de `clients` tablosu henüz yoktu). Migration'daki PK/FK/index adları TypeORM'un `SnakeNamingStrategy`'si
kullanılarak entity metadata'sından programatik olarak üretildi (gerçek bir DB'ye bağlanmadan). Unit ve mock'lu HTTP
testler: domain normalizasyonu, `ClientsService`/`ProjectsService`, `ProjectAccessGuard`, rol matrisi (HTTP, gerçek
guard zinciri).

**Lokal doğrulama bekliyor:** Runner'da Docker/Postgres yok; migration'ın gerçek DB'de temiz uygulanıp geri
alınabildiği ve `migration:generate`'in entity'lerle fark bulmadığı doğrulanmadı. `bun run db:up`, `bun run db:migrate`,
ardından `E2E_DATABASE=true DATABASE_URL=postgres://seo:seo@localhost:5432/seo_test bun run --filter api test:e2e`
ile `tenant-isolation.e2e-spec.ts`'teki client/proje satırları ve `clients-projects` uçları gerçek DB'ye karşı
çalıştırılmalı.

### [ ] T1.4 Bağlantılar (GSC ve GA4)
- Tablo: `connections`.
- `connectors/gsc/GscClient`, `connectors/ga4/Ga4Client`: service account auth, tipli metotlar, hata sınıflandırması (auth, quota, geçici, kalıcı).
- Endpoint'ler: bağlantı ekleme (`type`, `external_id`), doğrulama (`POST /connections/:id/verify`), silme, durum.
- `GET /connections/service-account`: kullanıcının property'ye ekleyeceği service account e-postasını döner.
- GSC tarafında `sites.list` ile erişilebilir property'leri listeleyen yardımcı endpoint (kullanıcı elle yazmak yerine seçsin).

**Kabul:**
- Gerçek bir property ile doğrulama `active` sonucunu veriyor.
- Yetkisiz property'de anlaşılır bir hata mesajı ve `error` durumu.

**Lokal doğrulama bekliyor:** Runner'da Postgres ve gerçek `GOOGLE_SA_JSON_BASE64` yok; `GscClient`/`Ga4Client` yalnız mock'lu unit testlerle (hata sınıflandırması, `verifyProperty`) ve `ConnectionsService`/controller'lar mock servislerle (http spec) doğrulandı. `bun run db:up`, `bun run db:migrate`, gerçek bir service account ve gerçek bir GSC/GA4 property ile: migration'ı uygula, service account e-postasını GSC property'sine ekle, `POST /connections` ile bağlantı oluştur, `POST /connections/:id/verify` çağır ve `active` sonucunu, yetkisiz bir property'de `error` + anlaşılır mesajı doğrula. `tenant-isolation.e2e-spec.ts`'teki yeni bağlantı satırları da `E2E_DATABASE=true` ile çalıştırılmalı.

### [ ] T1.5 GSC senkronizasyonu
- Tablolar: `gsc_site_daily`, `gsc_page_daily` (partition), `gsc_daily` (partition), `job_runs`, `api_usage`.
- Partition migration'ları (ARCHITECTURE §6).
- `gsc-sync` ve `gsc-backfill` processor'ları (ARCHITECTURE §9.1): 3 aşamalı çekim, sayfalama, batch upsert.
- `dispatch` kuyruğu ve `daily-dispatch` Job Scheduler'ı (sadece GSC kısmı; GA4 ve rank ilgili görevlerde eklenir).
- Bağlantı `active` olunca backfill otomatik başlıyor, ilerleme `backfill_progress`'ta.
- Manuel tetikleme: `POST /projects/:id/sync/gsc` → `runId`.
- Sorgu endpoint'leri:
  - `GET /projects/:id/gsc/overview?from&to&compare`: site toplamları ve günlük seri.
  - `GET /projects/:id/gsc/queries?from&to&search&sort&page&limit`: query bazında toplanmış tablo.
  - `GET /projects/:id/gsc/pages?...`: sayfa bazında tablo.
  - `GET /projects/:id/gsc/queries/:hash/pages`: bir sorgunun sayfaları (ve tersi).

**Kabul:**
- Gerçek bir property'de 16 aylık backfill tamamlanıyor.
- Aynı günün sync'i iki kez çalışınca satır sayısı değişmiyor (idempotent).
- Site toplamları ile GSC arayüzündeki toplamlar tutuyor.
- Query tablosu 100 binlerce satırda 1 saniyenin altında dönüyor (index kontrolü).

**Lokal doğrulama bekliyor:** Runner'da Postgres, Redis ve gerçek `GOOGLE_SA_JSON_BASE64` yok; sayfalama döngüsü, 3 aşamalı çekim, batch upsert SQL'i, jobId determinizmi, round-robin dispatch, backfill planı, `job_runs` kayıtları ve sorgu endpoint'leri mock'lu unit/http testleriyle doğrulandı. Kabul maddelerinin hiçbiri runner'da doğrulanamadı:
- Migration: `bun run db:up && bun run db:migrate` sonrası `\d+ gsc_daily` ile partition'ları (2024-01'den itibaren aylık + default) ve `IDX_gsc_daily_query_trgm` index'ini, `bun run --filter api migration:revert` ile `partman.part_config`'ten kaydın ve `partman.template_public_gsc_daily`'nin silindiğini kontrol et.
- Idempotency: `E2E_DATABASE=true DATABASE_URL=... DATABASE_SKIP_INITIALIZATION=false bun run --filter api test:e2e` ile `test/gsc-sync.e2e-spec.ts` (aynı gün iki kez → satır sayısı aynı, metrikler güncel; hash'ler Postgres `md5(text)` ile aynı) ve `tenant-isolation.e2e-spec.ts`'teki yeni GSC satırları.
- Backfill: gerçek service account ve property ile bağlantıyı `POST /connections/:id/verify` ile aktifleştir, `bun run dev:worker` çalışırken `/admin/queues`'ta ~488 `gsc-backfill` job'u (priority 10) ve `connections.backfill_progress.done`'ın `total`'a ulaşıp `backfill_status = done` olduğunu gör.
- Site toplamı: `GET /projects/:id/gsc/overview?from&to` toplamlarını GSC arayüzündeki aynı tarih aralığıyla karşılaştır.
- Performans: 100 binlerce satırlık projede `GET /projects/:id/gsc/queries` süresini ve `EXPLAIN ANALYZE` ile `IDX_gsc_daily_project_id_date` kullanımını kontrol et.
- Zamanlama: worker açılışında `daily-dispatch` scheduler'ının (`0 4 * * *` UTC) Redis'e kaydedildiğini ve `POST /projects/:id/sync/gsc`'nin döndüğü `runId`'nin `job_runs`'ta `queued → running → succeeded` ilerlediğini doğrula.

### [ ] T1.6 GA4 senkronizasyonu
- Tablo: `ga4_daily` (partition).
- `ga4-sync` ve backfill processor'ları (ARCHITECTURE §9.2), dispatch'e ekleme.
- Endpoint'ler: `GET /projects/:id/ga4/overview` (kanal kırılımlı), `GET /projects/:id/ga4/landing-pages?channel=Organic Search`.

**Kabul:** Organik oturum toplamı GA4 arayüzüyle (aynı tarih aralığı, aynı kanal) tutuyor.

**Lokal doğrulama bekliyor:** Runner'da Postgres, Redis ve gerçek `GOOGLE_SA_JSON_BASE64` yok; sayfalama döngüsü, tek istekle son 3 gün/backfill günü çekimi, batch upsert SQL'i, jobId determinizmi, backfill planı, `job_runs` kayıtları ve sorgu endpoint'leri (kanal kırılımı, `channel` filtresi) mock'lu unit/http testleriyle doğrulandı. Kabul maddesi runner'da doğrulanamadı:
- Migration: `bun run db:up && bun run db:migrate` sonrası `\d+ ga4_daily` ile partition'ları (2024-01'den itibaren aylık + default) kontrol et, `bun run --filter api migration:revert` ile `partman.part_config`'ten kaydın ve `partman.template_public_ga4_daily`'nin silindiğini doğrula.
- Idempotency: `E2E_DATABASE=true DATABASE_URL=... DATABASE_SKIP_INITIALIZATION=false bun run --filter api test:e2e` ile `test/ga4-sync.e2e-spec.ts` (aynı gün iki kez → satır sayısı aynı, metrikler güncel; hash Postgres `md5(text)` ile aynı) ve `tenant-isolation.e2e-spec.ts`'teki yeni GA4 satırları.
- Backfill: gerçek service account ve property ile bağlantıyı `POST /connections/:id/verify` ile aktifleştir, `bun run dev:worker` çalışırken `ga4-sync` kuyruğunda ~427 backfill job'u (priority 10, job adı `ga4-backfill`) ve `connections.backfill_progress.done`'ın `total`'a ulaşıp `backfill_status = done` olduğunu gör.
- Organik toplam: `GET /projects/:id/ga4/overview?from&to` içindeki `Organic Search` kanalının oturum toplamını GA4 arayüzündeki aynı tarih aralığı ve kanalla karşılaştır.
- Zamanlama: `daily-dispatch`'in aktif GA4 bağlantıları için `ga4-sync` job'u eklediğini ve `POST /projects/:id/sync/ga4`'ün döndüğü `runId`'nin `job_runs`'ta `queued → running → succeeded` ilerlediğini doğrula.

### [x] T1.7 DataForSEO client ve kullanım takibi
- `connectors/dataforseo/DataForSeoClient`: basic auth, retry, response `status_code` kontrolü, `cost` okuma.
- Metotlar: `serpTaskPost(tasks[])`, `serpTasksReady()`, `serpTaskGetAdvanced(id)`, `serpLiveAdvanced(task)`, `locations()`, `languages()`, `keywordSearchVolume(keywords, location, language)`.
- `UsageService.record(...)`: her ücretli çağrı `api_usage`'a yazılır.
- `GET /usage?from&to&groupBy=project|provider|day`: org bazlı maliyet raporu.

**Kabul:**
- Client unit testleri (mock HTTP).
- Tek bir gerçek live çağrısının maliyeti `api_usage`'da görünüyor.

**Lokal doğrulama bekliyor:** Runner'da `DFS_LOGIN`/`DFS_PASSWORD` (gerçek DataForSEO kimlik bilgisi) yok; "tek bir gerçek live çağrısının maliyeti `api_usage`'da görünüyor" kriteri mock HTTP testleriyle doğrulandı, gerçek API'ye karşı doğrulanmadı. Lokalde doğrulamak için: `.env`'e gerçek `DFS_LOGIN`/`DFS_PASSWORD` girin, `bun run db:up` ile Postgres'i açın, bir serviste (ör. bir Nest REPL/script) `DataForSeoClient.serpLiveAdvanced({ keyword: 'test', locationCode: 2792, languageCode: 'tr' }, { orgId, projectId })` çağırın ve `SELECT * FROM api_usage ORDER BY created_at DESC LIMIT 1;` ile maliyetin yazıldığını doğrulayın.

### [x] T1.8 Keyword yönetimi
- Tablolar: `keyword_groups`, `tracked_keywords`.
- CRUD endpoint'leri, gruplar, etiketler.
- Toplu ekleme: `POST /projects/:id/keywords/bulk`. Satır satır metin ya da CSV kabul eder (keyword, grup, cihaz, hedef URL). Normalizasyon ve tekrar tespiti yapılır, sonuç raporu döner (eklenen, atlanan, hatalı).
- GSC'den öneri: `GET /projects/:id/keywords/suggestions`. Son 28 günde gösterimi yüksek, takipte olmayan sorguları listeler.
- Keyword başına hacim ve CPC: eklendiğinde ve ayda bir `keywordSearchVolume` ile güncellenir (`tracked_keywords`'e `search_volume`, `cpc`, `volume_updated_at` kolonları).

**Kabul:**
- 40 keyword'lük CSV tek istekte ekleniyor.
- Tekrar eden satırlar atlanıyor.
- Öneriler takiptekileri hariç tutuyor.

**Lokal doğrulama bekliyor:** Runner'da Postgres ve Redis yok; migration'ın gerçek DB'ye uygulanması (unique kısıt, FK'ler), `keyword-volume` kuyruğunun worker'da işlenmesi, `daily-dispatch`'in 30 günden eski `volume_updated_at`'li projeleri toplaması ve `tenant-isolation.e2e-spec.ts`'e eklenen `keyword-groups`/`keywords` satırları mock'lu unit testlerle doğrulandı, gerçek DB/Redis'e karşı doğrulanmadı. Lokalde doğrulamak için: `bun run db:up`, `bun run --filter api migration:run` (ya da `dev:api` ilk açılışta), `bun run dev:api` ve `bun run dev:worker`; bir projeye `POST /projects/:id/keywords/bulk` ile 40 satırlık bir CSV gönderin, `{ added: 40, skipped: 0, errors: [] }` dönmeli; `SELECT * FROM tracked_keywords` ile satırları, `keyword-volume` kuyruğunun (gerçek `DFS_LOGIN`/`DFS_PASSWORD` ile) `search_volume`/`cpc`/`volume_updated_at`'i doldurduğunu ve `api_usage`'a maliyet yazıldığını doğrulayın; `tenant-isolation.e2e-spec.ts`'i `bun run --filter api test:e2e` ile çalıştırın.

### [ ] T1.9 Rank tracking
- Tablolar: `rank_tasks`, `rank_daily` (partition), `keyword_rank_latest`.
- `rank-post`, `rank-poll`, `rank-fetch` processor'ları (ARCHITECTURE §9.3). Dispatcher'a günlük ve haftalık rank ekleme.
- Domain eşleştirme yardımcısı (subdomain ve www normalizasyonu), unit test.
- Anlık kontrol: `POST /projects/:id/keywords/:kid/check-now` (live, rate limitli).
- Takılan task temizliği (24 saat).
- Endpoint'ler: `GET /projects/:id/rankings/history?keywordIds&from&to`, `GET /projects/:id/rankings/serp/:kid?date` (o günün SERP'i: competitors_top ve features).

**Kabul:**
- Bir projenin 40 keyword'ü Standard queue ile kontrol ediliyor, sonuçlar `rank_daily`'ye düşüyor.
- Aynı gün tekrar dispatch edilince yeni task açılmıyor.
- Domain eşleştirme testleri geçiyor (www, subdomain, trailing slash, farklı protokol).

**Durum:** "Aynı gün tekrar dispatch" ve "domain eşleştirme" kriterleri unit testlerle doğrulandı (`rank-post.service.spec.ts`, `rank-flow.spec.ts`, `domain-match.spec.ts`). Post → poll → fetch zinciri 40 keyword'lük bellek içi store ve DataForSEO dokümantasyonu biçimindeki fixture'larla (`__fixtures__/serp-task-get-advanced.fixture.ts`) uçtan uca test edildi; `rank_tasks`'ın aynı gün tekrar ayrılmaması SQL'de `INSERT ... ON CONFLICT (tracked_keyword_id, check_date)` ile sağlanır. Başlık, gerçek Standard queue kriteri doğrulanana kadar işaretsiz.

**Lokal doğrulama bekliyor:** Runner'da Postgres, Redis ve gerçek `DFS_LOGIN`/`DFS_PASSWORD` yok. Migration'ın (`rank_daily` partman partition'ı dahil) gerçek DB'ye uygulanması, `rank-poll` Job Scheduler'ının (2 dk) ve `weekly-dispatch`'in (`0 4 * * 1`) Redis'te kaydı, `RankStore`'un raw SQL'i, `check-now` rate limitinin Redis throttler storage'ıyla çalışması ve `tenant-isolation.e2e-spec.ts`'e eklenen rank satırları gerçek ortamda çalıştırılmadı. Lokalde doğrulamak için:
1. `bun run db:up`, `bun run --filter api migration:run`, `.env`'e gerçek `DFS_LOGIN`/`DFS_PASSWORD`; `bun run dev:api` ve `SCHEDULER_ENABLED=true bun run dev:worker`.
2. Bir projeye (domain'i gerçek bir site) `POST /projects/:id/keywords/bulk` ile 40 keyword ekleyin.
3. Dispatch'i elle tetikleyin: bull-board'dan (`/admin/queues`) `dispatch` kuyruğuna `daily-dispatch` adlı, `{}` datalı bir job ekleyin (ya da 04:00 UTC'yi bekleyin). `SELECT status, count(*) FROM rank_tasks GROUP BY 1` 40 `posted` göstermeli; `api_usage`'da `serp/google/organic/task_post` satırı (units 40) olmalı.
4. Aynı job'u tekrar ekleyin: `rank_tasks` hâlâ 40 satır, yeni `task_post` maliyeti yok.
5. Birkaç dakika içinde `rank-poll` task'ları `ready`/`fetched` yapmalı; `SELECT * FROM rank_daily WHERE project_id = ...` 40 satır (bulunamayanlarda `position` null), `competitors_top` ve `serp_features` dolu. Worker logunda `rank günü tamamlandı` görünmeli.
6. `GET /projects/:id/rankings/history?keywordIds=<id>` ve `GET /projects/:id/rankings/serp/<id>` sonuçları dönmeli; panelde bir keyword'ün pozisyonunu Google'da elle kontrol edin.
7. `POST /projects/:id/keywords/:kid/check-now` 202 ve `runId` dönmeli; `job_runs` kaydı `succeeded`, `rank_daily`'de bugünün satırı `source = dfs_live`. Aynı kullanıcıyla dakikada 6. istek 429 dönmeli.
8. `bun run --filter api test:e2e` ile `tenant-isolation.e2e-spec.ts`'i çalıştırın.

### [ ] T1.10 Özetler
- Tablo: `project_daily_summary`.
- `summary` processor'ı (ARCHITECTURE §10): project_daily_summary upsert, keyword_rank_latest güncelleme, visibility skoru.
- Visibility skoru için CTR eğrisi sabitleri tek dosyada.
- Tetikleme: gsc-sync, ga4-sync ve günün rank-fetch'leri bittikten sonra. Aynı gün birden fazla tetiklenirse son hali kalır (idempotent).
- Endpoint'ler:
  - `GET /projects/:id/summary?from&to`
  - `GET /projects/summary?clientId` (org genelinde proje kartları: son değerler + 7/28 günlük değişim)

**Kabul:** 20 projelik org'da proje listesi özeti tek sorguyla, 200 ms altında dönüyor.

**Durum:** Migration, `summary` processor'ı (`SummaryService`), `keyword_rank_latest` güncellemesi (`RankSummaryService`, saf hesap `rank-summary-calc.ts`), visibility skoru (`visibility.constants.ts`) ve her iki endpoint eklendi. Tetikleme `sync.completed` (gsc/ga4, yeni event) ve `rank.day_completed` ile: `SummaryTriggerListener` deterministik jobId (`summary:{projectId}:{date}`) ile `summary` kuyruğuna ekler, bitince `alert-eval` job'u eklenir. Unit testlerle doğrulandı: `rank-summary-calc.spec.ts` (değişim/best/sparkline), `visibility.constants.spec.ts` (0-100 aralığı), `rank-summary.service.spec.ts` ve `summary.service.spec.ts` (idempotency). `GET /projects/summary` tek sorguyla (`SummaryStore.cards`, CTE'ler) döner; `client_viewer` kapsaması `clients-projects.http.spec.ts`'te test edildi. Başlık, 200 ms ölçümü gerçek DB'de yapılamadığı için işaretsiz.

**Lokal doğrulama bekliyor:** Runner'da Postgres ve Redis yok. Migration'ın gerçek DB'ye uygulanması ve 200 ms hedefinin 20 projelik seed'le ölçülmesi lokalde yapılmalı:
1. `bun run db:up`, `bun run --filter api migration:run`, `bun run dev:api` ve `SCHEDULER_ENABLED=true bun run dev:worker`.
2. 20 proje, her birine birkaç gün `gsc_site_daily`/`ga4_daily`/`rank_daily` satırı (seed script ya da gerçek sync) oluşturun.
3. `GET /api/v1/projects/summary` isteğini ölçün (`curl -w '%{time_total}'` ya da panelden); 200 ms altında dönmeli, sorgu planını `EXPLAIN ANALYZE` ile N+1 olmadığını doğrulayın.
4. Bir proje için GSC ya da GA4 sync'i (`POST /projects/:id/sync/gsc`) tetikleyin; worker logunda `summary job eklendi` ve `project_daily_summary güncellendi` görünmeli, `SELECT * FROM project_daily_summary` ilgili günün satırını göstermeli.
5. Aynı günü iki kez tetikleyin (`SELECT count(*)` hâlâ 1 satır); `keyword_rank_latest`'i rank verisi olan bir proje için kontrol edin.

### [x] T1.11 Panel: auth ve yönetim ekranları
- Login, davet kabul, şifre belirleme.
- Org seçici (üst bar), aktif org localStorage'da (try/catch ile), X-Org-Id header'ı mutator'dan.
- Client listesi ve formu, proje listesi ve formu (lokasyon ve dil seçicili).
- Bağlantılar ekranı: service account e-postasını kopyalama, GSC property seçimi, GA4 property ID girişi, doğrulama durumu, backfill ilerleme çubuğu.
- Üyeler ve davetler ekranı.
- Bildirim kanalları ekranı (e-posta, Discord, Slack).
- Rol bazlı görünürlük: client_viewer yönetim menülerini görmez.

**Kabul:** Sıfırdan org oluşturup client, proje ve GSC bağlantısı eklemek ve backfill'in başladığını görmek panelden yapılabiliyor.

**Lokal doğrulama bekliyor:** Runner'da DB/Redis ve gerçek API çalışmadığı için uçtan uca akış, orval tiplerine uyan ve OpenAPI sözleşmesiyle birebir eşleşen sahte bir HTTP sunucusuyla tarayıcıda doğrulandı (login → org seçici → client/proje CRUD → bağlantılar ekranı, SA e-postası kopyalama, GSC/GA4 bağlama, doğrulama, backfill ilerleme çubuğu → üyeler/davetler; açık/koyu tema ve mobil genişlik). Gerçek API ve DB ile uçtan uca (özellikle davet e-postası gönderimi, gerçek Google SA/GA4 doğrulaması ve backfill polling'i) lokalde tekrar doğrulanmalı.

### [x] T1.12 Panel: proje dashboard'u ve GSC explorer
- **Org ana sayfası:** proje kartları (tıklama, oturum, ortalama pozisyon, visibility; 7/28 günlük değişim, mini grafik).
- **Proje özeti:** tarih aralığı seçici + önceki dönem karşılaştırması. KPI satırı, GSC trend grafiği (tıklama/gösterim), organik oturum grafiği, pozisyon dağılımı (top 3/10/20/100), son sync durumu.
- **GSC explorer:** Queries ve Pages sekmeleri, arama, sıralama, sayfalama, dönem karşılaştırması (değişim kolonları). Satır tıklanınca sorgunun sayfalarını ya da sayfanın sorgularını gösteren detay paneli (sheet).
- Tablo filtreleri ve tarih aralığı URL search param'larında tutulur (link paylaşılabilir).

**Kabul:** Explorer, büyük bir projede sayfalama ve arama ile akıcı çalışıyor.

**Lokal doğrulama bekliyor:** Explorer'ın backend `gsc/queries` ve `gsc/pages` endpoint'leri (sayfalama, arama, sıralama) gerçek DB ve büyük bir veri setiyle (binlerce satır) performans açısından test edilmedi; runner'da DB olmadığı için sahte bir HTTP sunucusuyla (137 satır, 7 sayfa) uçtan uca doğrulandı. Dönem karşılaştırması (değişim kolonları) backend'de satır bazlı desteklenmediği için client tarafında önceki dönemin ilk 200 satırını çekip anahtara göre eşleştirerek hesaplanıyor; gerçek veride bu yaklaşımın kabul edilebilir olup olmadığı ürün sahibiyle teyit edilmeli.

### [x] T1.13 Panel: keyword ekranı
- Keyword tablosu: keyword, grup, cihaz, pozisyon, 1/7/30 günlük değişim (renkli), en iyi pozisyon, URL, hacim, sparkline, son kontrol.
- Filtreler: grup, etiket, pozisyon aralığı (top 3/10/20/dışarıda), yükselen/düşen.
- Toplu ekleme dialog'u (metin/CSV yapıştırma, önizleme, sonuç raporu).
- GSC önerileri dialog'u (seçip tek tıkla takibe alma).
- Keyword detayı: pozisyon geçmişi grafiği, günün SERP'i (ilk 10 ve özellikler), "şimdi kontrol et".
- Grup yönetimi.

**Kabul:** 40 keyword'lük bir projede tüm akış (ekle, kontrol et, geçmişi gör) panelden yapılabiliyor.

**Lokal doğrulama bekliyor:** Backend `keyword_rank_latest`'i doğrudan liste olarak döndüren bir endpoint sunmuyor; tablo kolonları (pozisyon, 1/7/30g değişim, en iyi pozisyon, sparkline, son kontrol) `rankings/history`'den (T1.9) istemci tarafında hesaplanıyor (`rank-calc.ts`, backend'deki `calculateRankLatest`'in testli bir benzeri). "En iyi pozisyon" bu yüzden tüm zamanların değil yalnız görüntülenen 30 günlük pencerenin en iyisi; pozisyon aralığı/yükselen-düşen filtreleri de bu hesaba göre client tarafında uygulanıyor. Runner'da DB/Redis olmadığı için uçtan uca akış (ekle, GSC önerisini takibe al, filtrele, "şimdi kontrol et" + rate limit + grup yönetimi, client_viewer kısıtı, açık/koyu tema, mobil) OpenAPI sözleşmesiyle birebir eşleşen sahte bir HTTP sunucusuyla tarayıcıda doğrulandı; gerçek API/DB ve 40+ keyword'lük bir projede (özellikle `rankings/history`'nin `MAX_HISTORY_KEYWORDS=50` sınırı) lokalde tekrar doğrulanmalı.

### [ ] T1.14 Alertler
- Tablolar: `alert_rules`, `alert_events`, `notification_channels`.
- `alert-eval` processor'ı (ARCHITECTURE §11): dört kural tipi, dedupe, cooldown.
- `notify` processor'ı: e-posta, Discord, Slack gönderimi; kanal hatası `notify_error`'a yazılır.
- Mesaj şablonları kısa ve eyleme dönük: proje, keyword, önceki ve yeni pozisyon, panel linki.
- Panel: kural listesi ve formu (tip bazlı dinamik form), alert geçmişi, kanal test butonu.

**Kabul:**
- Sahte veriyle rank düşüşü üretildiğinde Discord'a tek bildirim düşüyor.
- Cooldown içinde tekrar üretilince bildirim gitmiyor.

### [ ] T1.15 Raporlar
- Tablolar: `reports`, `report_schedules`.
- Report token (kısa ömürlü JWT, tek rapora scope'lu) ve `GET /reports/:id/data`.
- Panel `/print/reports/:id` route'u: layout'suz, A4 print CSS, grafikler çizilince `data-report-ready`.
- `report` processor'ı: Playwright chromium, PDF, StorageService, `reports` güncelleme, mail.
- `report-dispatch` Job Scheduler'ı (saatlik, zamanı gelen schedule'lar).
- Panel: rapor listesi, manuel oluşturma (dönem, analist notu), PDF indirme, schedule yönetimi, alıcılar.
- Client markalaması (logo, renk) `clients.branding`'den.

**Kabul:**
- Bir proje için aylık PDF 30 saniyenin altında üretiliyor.
- Grafikler PDF'te eksiksiz görünüyor.
- Haftalık schedule doğru saatte mail atıyor.

### [ ] T1.16 Bakım işleri, seed ve dokümantasyon
- `HousekeepingModule` (ARCHITECTURE §8.2): partman bakımı, token ve davet temizliği, job_runs temizliği, takılı job düzeltme.
- Seed script'i (ARCHITECTURE §15), 60 günlük sahte veri üretimi dahil.
- `README.md`: kurulum, komutlar, service account oluşturma adımları, DataForSEO key ekleme, ilk proje ekleme akışı.

**Kabul:** Temiz bir makinede README takip edilerek 15 dakikada sistem ayağa kalkıyor ve seed verisiyle panel dolu görünüyor.

### Faz 1 çıkış kriterleri
- Mevcut ajans müşterilerinin tamamı sistemde, GSC ve GA4 bağlı, backfill tamamlanmış.
- Proje başına 30-40 keyword takipte, günlük rank verisi akıyor.
- Haftalık raporlar otomatik gidiyor, alertler Discord'a düşüyor.
- Tenant izolasyon testi yeşil.
- Aylık DataForSEO maliyeti `/usage` ekranından okunabiliyor.

---

## Faz 2: Teknik SEO ve otomasyon

Detaylı görevler Faz 1 bitince yazılacak. Kapsam:

- **T2.1 Crawler:** Crawlee (Cheerio + Playwright), proje başı crawl ayarları (max sayfa, JS render, include/exclude pattern, robots uyumu), SSRF koruması, `crawls` ve `crawl_pages` tabloları, snapshot'ların storage'a yazılması.
- **T2.2 Audit kural motoru:** Kural arayüzü (sayfa bazlı ve site bazlı), severity ve kategori, ilk kural seti (status, redirect zinciri, canonical, title/description, H1, hreflang, schema, alt text, iç link derinliği, orphan sayfalar, sitemap/robots uyumu).
- **T2.3 Crawl diff:** Yeni çıkan ve çözülen issue'lar, yeni 404'ler, kaybolan sayfalar.
- **T2.4 GSC çapraz kontrol:** Crawl'da olup gösterimi olmayan sayfalar, GSC'de olup crawl'da bulunamayan sayfalar, URL Inspection API ile index durumu (kotalı, seçili sayfalar için).
- **T2.5 PageSpeed ve CrUX:** Core Web Vitals, sayfa grupları bazında.
- **T2.6 Otomasyon motoru:** Event kataloğu, trigger/condition/action yapısı, `alert_rules`'un bu yapıya migrate edilmesi, hazır şablonlar, çalıştırma geçmişi.
- **T2.7 Rakipler:** Proje başına rakip domain'ler, `competitors_top` verisinden otomatik rakip tespiti, rakip pozisyon karşılaştırması.
- **T2.8 Keyword keşfi:** DataForSEO Labs ile ranked keywords, keyword ideas, content gap. Maliyet önizlemesi zorunlu.
- **T2.9 Panel:** Audit ekranları, issue listesi ve detayları, otomasyon kural editörü, rakip ekranı.

## Faz 3: Aksiyon katmanı ve AI

- **T3.1 Onay akışı:** `change_requests` tablosu, onay ekranı. Hiçbir değişiklik onaysız uygulanmaz.
- **T3.2 WordPress entegrasyonu:** Application password, Yoast/RankMath meta alanları, draft post, schema ekleme.
- **T3.3 GitHub entegrasyonu:** GitHub App, repo bağlama, metadata/sitemap/robots/JSON-LD değişikliklerinin PR olarak açılması.
- **T3.4 AI modülü:** Claude API client (connectors), prompt şablonlarının versiyonlanması, maliyetin `api_usage`'a yazılması, org bazlı AI bütçesi.
- **T3.5 Embeddings:** pgvector tabloları, sayfa ve keyword embedding pipeline'ı, keyword clustering, cannibalization tespiti.
- **T3.6 Agent'lar:** Meta optimizer (düşük CTR'lı sayfalar), content brief, internal linking, issue triage, rapor yorumu taslağı.
- **T3.7 MCP server:** Kendi verimiz üzerinde okuma tool'ları. Kimlik doğrulamalı, tenant scope'lu.

## Faz 4: Ürünleşme

- Self-serve kayıt, onboarding, plan ve kota yönetimi (`api_usage` tabanlı).
- Ödeme entegrasyonu.
- GSC ve GA4 için OAuth bağlantısı (service account'a alternatif).
- AI görünürlük modülü (DataForSEO LLM Mentions ya da benzeri).
- Google Business Profile ve lokal SEO.
- Türkçe ve İngilizce arayüz (i18n).
- Deploy, yedekleme ve monitoring (bu fazda ele alınacak).
