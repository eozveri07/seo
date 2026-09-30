# seo-platform

Çok kiracılı SEO takip ve otomasyon platformu. Ajans modeli: organization > client > project (tek domain).
Search Console, GA4 ve DataForSEO verisini toplar, rank takibi yapar, özet, rapor ve uyarı üretir.
Sonraki fazlarda crawler, audit, otomasyon motoru, CMS/GitHub entegrasyonları ve AI agent'lar eklenecek.

- Mimari: `docs/ARCHITECTURE.md`
- Faz planı ve görevler: `docs/PLAN.md`

Her göreve başlamadan önce PLAN.md'deki görevi ve ARCHITECTURE.md'deki ilgili bölümü oku.

## Stack

| Katman | Seçim |
|---|---|
| Paket yöneticisi | Bun workspaces, tek lockfile (`bun.lock`) |
| Runtime | Node.js 22 LTS. Nest Bun runtime'ında çalıştırılmaz |
| API | NestJS 11, Express adapter (`NestExpressApplication`), modüler monolit |
| Worker | Aynı Nest uygulaması, ayrı entrypoint (`src/worker.ts`) |
| ORM | TypeORM + `@nestjs/typeorm`, `SnakeNamingStrategy`, `synchronize: false` |
| Validation | class-validator + class-transformer |
| OpenAPI | `@nestjs/swagger` CLI plugin |
| Veritabanı | PostgreSQL 17 + pgvector, pg_trgm, pg_partman, unaccent |
| Kuyruk | Redis 7 + BullMQ (`@nestjs/bullmq`). RabbitMQ ya da başka broker yok |
| Zamanlama | BullMQ Job Scheduler (tenant işleri), `@nestjs/schedule` (sadece sistem bakım işleri) |
| Modül içi event | `@nestjs/event-emitter` |
| Request context | `nestjs-cls` |
| Panel | Vite, React 19, TypeScript, Tailwind, shadcn/ui, TanStack Router + Query + Table, react-hook-form + zod |
| API client | orval (OpenAPI spec'ten üretilir) |

## Repo yapısı

```
apps/
  api/        NestJS: HTTP API + worker
  panel/      Vite SPA
docker/
  postgres/   Extension'lı Postgres image
docs/
docker-compose.yml
```

## Komutlar

```bash
bun install
bun run db:up              # Postgres + Redis (docker compose)
bun run db:migrate         # migration'ları uygula
bun run dev:api            # API, :3000
bun run dev:worker         # worker
bun run dev:panel          # panel, :5173 (/api -> :3000 proxy)
bun run gen:api            # OpenAPI export + orval client üretimi
bun run --filter api migration:generate src/database/migrations/<Isim>
bun run --filter api test
bun run --filter api test:e2e
bun run --filter api seed    # geliştirme verisi (yalnız NODE_ENV=development)
bun run lint
bun run typecheck
```

## Mimari kurallar (zorunlu)

1. **Modül sınırı.** Bir modül başka bir modülün entity'sini ya da repository'sini inject etmez. Başka modülün verisine sadece o modülün export ettiği service üzerinden erişilir.
2. **Modüller arası yan etki event ile olur.** Aynı process içindeki hafif işler için EventEmitter2, ağır ya da async işler için BullMQ job kullanılır. Döngüsel import yasak. `forwardRef` kullanma, tasarımı düzelt.
3. **Processor ince, service kalın.** Processor job verisini doğrular, CLS context'ini kurar, service'i çağırır. İş mantığı processor'a yazılmaz.
4. **Tenant scope zorunlu.** Tenant verisi taşıyan her entity `TenantScopedEntity`'den türer (`org_id`). Tenant verisine giden her sorgu `org_id` filtresi içerir. HTTP'de `org_id` TenantGuard tarafından CLS'e yazılır. Job'larda job datasında taşınır ve processor başında CLS'e set edilir. Body ya da query'den gelen `org_id`'ye asla güvenilmez.
5. **Dış API çağrıları sadece `connectors/` altındaki client'lardan yapılır.** Bunlar GSC, GA4, DataForSEO ve ileride Claude. Ücretli her çağrı `api_usage` tablosuna maliyetiyle loglanır.
6. **HTTP isteği içinde uzun iş yapılmaz.** 2 saniyeyi aşabilecek her iş kuyruğa atılır, endpoint `runId` döner.
7. **Job'lar idempotent.** Deterministik jobId kullanılır (ör. `gsc-sync:{projectId}:{date}`), yazma işlemleri upsert ile yapılır. Aynı job iki kez çalışırsa veri bozulmaz.
8. **Migration'lar elle gözden geçirilir.** Extension, partition ve özel index'ler (`gin_trgm_ops`, `hnsw`) raw SQL ile migration içinde yazılır.
9. **Secret'lar DB'de şifreli durur.** Service account JSON, OAuth token ve API key `CryptoService` ile AES-256-GCM şifrelenir. Log'a ve response'a asla yazılmaz.
10. **Panel, API kaynak kodundan import etmez.** Sadece `apps/panel/src/api/` altındaki orval çıktısını kullanır. API tipleri panelde elle yazılmaz.

## Zamanlama kuralı

- **Tenant ya da proje bazlı tekrarlayan işler BullMQ Job Scheduler ile yapılır.** GSC sync, GA4 sync, rank check, rapor ve alert değerlendirme bu kapsamda. Bir dispatcher job'u proje bazlı job'ları deterministik jobId ile kuyruğa atar. Birden fazla worker çalışsa bile iş tek kez çalışır.
- **`@nestjs/schedule` sadece sistem bakım işleri içindir.** Örnekler: pg_partman bakımı, süresi dolmuş refresh token temizliği, eski job kayıtlarının temizliği. Bu job'lar sadece `SCHEDULER_ENABLED=true` olan worker'da kayıt olur, API process'inde asla çalışmaz.

## Kod konvansiyonları

- TypeScript `strict`. `any` yasak. Zorunlu istisnada nedenini yorumla belirt.
- **İsimlendirme:** dosyalar kebab-case, class'lar PascalCase. Tablolar snake_case ve çoğul, kolonlar snake_case (naming strategy halleder).
- **Primary key:** `uuid`, uygulamada UUIDv7 üretilir (`uuid` paketi, `v7()`). Zaman serisi tablolarında composite PK kullanılır.
- **Tipler:** zaman `timestamptz`, günlük metrikler `date`, para ve maliyet `numeric(12,6)`.
- **DTO'lar:** `CreateXDto`, `UpdateXDto`, `XResponseDto`, `ListXQueryDto`. Entity doğrudan response olarak dönülmez.
- **Liste endpoint'leri** sayfalıdır (`page`, `limit`; limit en fazla 200) ve `{ items, total, page, limit }` döner.
- **Hatalar:** domain hataları özel exception sınıflarıyla atılır. Global filter hepsini `{ error: { code, message, details? } }` gövdesine çevirir. `code` sabit bir string'dir (ör. `PROJECT_NOT_FOUND`).
- **Config:** `@nestjs/config` ve class-validator ile env doğrulanır. Eksik ya da hatalı env ile uygulama açılmaz.
- **Log:** Nest Logger. Job loglarında `orgId`, `projectId`, `jobId` alanları bulunur.
- **API:** prefix `/api/v1`. Org kapsamlı endpoint'lerde aktif organizasyon `X-Org-Id` header'ı ile gelir.
- Entity'lerde eager relation kullanılmaz. Controller içinde repository kullanılmaz.

## Test

- Service'ler için unit test (jest).
- Kritik akışlar için e2e test, ayrı test veritabanıyla.
- **Tenant izolasyon e2e testi her zaman geçmeli:** org A'nın kullanıcısı org B'nin hiçbir kaynağını göremez, değiştiremez. Yeni bir tenant kaynağı eklendiğinde bu teste o kaynak da eklenir.

## Yapılmayacaklar

- RabbitMQ, Kafka ya da başka bir message broker eklemek.
- BullMQ Pro özelliklerini (groups vb.) varsaymak. OSS BullMQ kullanılıyor.
- `synchronize: true`.
- `@nestjs/schedule` ile tenant bazlı iş zamanlamak.
- Secret'ları loglamak ya da API response'una koymak.
- AI ya da otomasyonun müşteri sitesine onaysız yazması (Faz 3 kuralı; her değişiklik draft ya da PR olarak gelir).

## Görev akışı

1. PLAN.md'den sıradaki görevi al, kapsamını ve kabul kriterlerini oku.
2. Değişikliği yap. Migration gerekiyorsa üret, SQL'i gözden geçir, gerekirse elle düzelt.
3. `bun run lint`, `bun run typecheck` ve ilgili testleri çalıştır.
4. API sözleşmesi değiştiyse `bun run gen:api` çalıştır.
5. PLAN.md'de görevi `[x]` olarak işaretle, gerekiyorsa not düş.
