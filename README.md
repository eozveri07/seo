# seo

Çok kiracılı SEO takip ve otomasyon platformu. Bkz. `CLAUDE.md` ve `docs/`.

## Önkoşullar

- [Bun](https://bun.sh) (paket yöneticisi, tek lockfile).
- Node.js 22 LTS (API/worker bununla çalışır; Nest Bun runtime'ında çalıştırılmaz).
- Docker (ve docker compose) — Postgres ve Redis için.
- (Opsiyonel, raporlar için) Playwright/chromium — bkz. [Playwright kurulumu](#playwrightchromium-ve-report_token_secret-t115).

## Kurulum

```bash
bun install
cp .env.example .env
```

`.env`'i doldurun (bkz. [`.env` ve secret üretimi](#env-ve-secret-üretimi) aşağıda),
sonra:

```bash
bun run db:up             # Postgres + Redis (docker compose)
bun run db:migrate        # migration'ları uygula
bun run dev:api            # API, :3000
bun run dev:worker         # worker (ayrı terminal)
bun run dev:panel          # panel, :5173 (/api -> :3000 proxy, ayrı terminal)
```

İlk kullanıcı, veritabanında hiç kullanıcı yokken `POST /api/v1/auth/register` ile
(panelde kayıt formuyla) oluşturulur; sonraki kullanıcılar davetle gelir (T1.2). Alternatif
olarak paneli hemen dolu görmek için [seed script'ini](#seed-script) çalıştırabilirsiniz.

`.nakres/agent.yml`, nakres önizleme ve QA için uygulamanın nasıl başlatılacağını (kurulum,
dev komutu ve portu) tanımlar.

## Komutlar

CLAUDE.md'deki liste ile aynı:

```bash
bun install
bun run db:up              # Postgres + Redis (docker compose)
bun run db:migrate         # migration'ları uygula
bun run dev:api             # API, :3000
bun run dev:worker          # worker
bun run dev:panel           # panel, :5173 (/api -> :3000 proxy)
bun run gen:api              # OpenAPI export + orval client üretimi
bun run --filter api migration:generate src/database/migrations/<Isim>
bun run --filter api test
bun run --filter api test:e2e
bun run --filter api seed    # geliştirme verisi (bkz. aşağı)
bun run lint
bun run typecheck
```

## `.env` ve secret üretimi

`.env.example`'daki tüm değişkenler için kısa açıklama:

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | `docker compose`'daki Postgres'e bağlantı, ör. `postgres://seo:seo@localhost:5432/seo`. |
| `REDIS_URL` | BullMQ ve throttler için Redis bağlantısı. |
| `JWT_ACCESS_SECRET` | Access JWT imza anahtarı (HS256, en az 32 karakter). Zorunlu. |
| `JWT_ACCESS_TTL` | Access JWT ömrü, saniye (öneri: `900`, 15 dakika). |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token ömrü, gün. |
| `REPORT_TOKEN_SECRET` | Rapor print route'unun tek-raporluk token imza anahtarı, bkz. [Raporlar](#raporlar-playwrightchromium-ve-report_token_secret-t115). |
| `ENCRYPTION_KEY` | Secret'ları (service account JSON, OAuth token, API key) şifreleyen AES-256-GCM anahtarı. Zorunlu, 32 byte base64. |
| `GOOGLE_SA_JSON_BASE64` | GSC/GA4 için Google service account JSON'unun base64 hâli, bkz. [Google Cloud service account](#google-cloud-service-account-gsc-ve-ga4). GSC/GA4 bağlamayacaksanız boş bırakılabilir. |
| `DFS_LOGIN`, `DFS_PASSWORD` | DataForSEO hesap bilgileri, bkz. [DataForSEO](#dataforseo). Rank tracking bağlamayacaksanız boş bırakılabilir. |
| `SMTP_*`, `MAIL_FROM` | Boşsa `MailService` dev'de console'a yazan `jsonTransport` kullanır; gerçek e-posta göndermez. |
| `STORAGE_DIR` | Rapor PDF'lerinin yazıldığı local disk klasörü. |
| `SCHEDULER_ENABLED` | `true` ise worker `HousekeepingModule`'ü (ARCHITECTURE §8.2) yükler. Tek worker çalıştırıyorsanız `true` bırakın. |
| `WORKER_QUEUES` | Boşsa worker tüm kuyrukları işler; virgülle kuyruk adı verilirse yalnız onları işler (ör. `gsc-sync,ga4-sync`). |

İki secret `openssl` ile üretilir:

```bash
openssl rand -base64 32   # ENCRYPTION_KEY, JWT_ACCESS_SECRET, REPORT_TOKEN_SECRET için
```

Üçünü de ayrı ayrı çalıştırıp `.env`'deki ilgili değere yapıştırın; `ENCRYPTION_KEY` yanlış
uzunlukta ya da eksikse uygulama açılmaz.

## Google Cloud service account (GSC ve GA4)

Faz 1'de GSC ve GA4 bağlantısı tek bir service account üzerinden yapılır (ARCHITECTURE §9.1,
§9.2); kullanıcı bazlı OAuth Faz 4'te gelecek.

1. [Google Cloud Console](https://console.cloud.google.com)'da bir proje açın (ya da
   var olanı kullanın) ve şu API'leri etkinleştirin: **Search Console API**,
   **Google Analytics Data API**.
2. **IAM & Admin > Service Accounts**'tan yeni bir service account oluşturun (rol atamanıza
   gerek yok; yetki GSC/GA4 tarafında property bazında verilir).
3. Service account için bir JSON anahtarı indirin (**Keys > Add key > Create new key > JSON**).
4. JSON'u base64'e çevirip `.env`'deki `GOOGLE_SA_JSON_BASE64`'e yazın:

   ```bash
   base64 -i service-account.json | tr -d '\n'
   ```

5. Uygulamayı açtıktan sonra panelde ya da `GET /api/v1/connections/service-account` ile
   service account'un e-postasını (`client_email`) öğrenin.
6. Bu e-postayı:
   - **Search Console**'da bağlamak istediğiniz property'ye "Full" veya "Owner" yetkiyle
     kullanıcı olarak ekleyin (Search Console > Ayarlar > Kullanıcılar ve izinler).
   - **GA4**'te bağlamak istediğiniz property'ye en az "Viewer" rolüyle ekleyin
     (Yönetici > Erişim Yönetimi).
7. Panelde proje ayarlarından **GSC** ve **GA4** bağlantılarını ekleyin (`externalId` GSC'de
   property URL'i, GA4'te property id'sidir); doğrulama `sites.list` / örnek bir rapor
   çağrısıyla yapılır ve sonuç bağlantının durumuna yazılır.

## DataForSEO

Rank tracking (ARCHITECTURE §9.3) [DataForSEO](https://dataforseo.com) Standard queue'sunu
kullanır:

1. DataForSEO'da bir hesap açın, panellerindeki **API Access** sayfasından login/password
   bilgilerinizi alın (API key'iniz farklıysa oradaki login/password çiftini kullanın).
2. `.env`'de `DFS_LOGIN` ve `DFS_PASSWORD`'ü doldurun.
3. Her DataForSEO çağrısının maliyeti `api_usage` tablosuna yazılır; aylık toplam panelde
   **/usage** ekranından okunur.

## Playwright/chromium ve `REPORT_TOKEN_SECRET` (T1.15)

`report` job'u (worker) panelin `/print/reports/:id` sayfasını Playwright'ın chromium'uyla
açıp PDF'e çevirir (ARCHITECTURE §12). Chromium binary'si ayrı kurulur, `bun install` onu
indirmez:

```bash
cd apps/api
bunx playwright install --with-deps chromium
```

`REPORT_TOKEN_SECRET`, `GET /reports/:id/data` için imzalanan 10 dakikalık, tek rapora
scope'lu token'ın imza anahtarıdır (`JWT_ACCESS_SECRET`'tan ayrı):

```bash
openssl rand -base64 32
```

Worker'ın panele erişebilmesi için `PANEL_URL` doğru olmalı (dev'de `http://localhost:5173`).
PDF üretimi lokal olarak `bun run dev:worker` + `bun run dev:panel` ile, `WORKER_QUEUES=report`
verip manuel bir rapor oluşturularak doğrulanır.

## İlk proje ekleme akışı

1. Panelde `/organizations/new` ile bir organizasyon oluşturun (oluşturan kullanıcı owner
   olur) ya da davet kabul edin.
2. Org ana sayfasından bir **client** (ajans müşterisi) oluşturun.
3. Client altında bir **proje** oluşturun: proje adı, domain (protokolsüz, `www` olmadan) ve
   isteğe bağlı ülke/dil/timezone.
4. Proje sayfasının **Bağlantılar** sekmesinden GSC ve GA4'ü bağlayın (bkz.
   [Google Cloud service account](#google-cloud-service-account-gsc-ve-ga4)); bağlantı aktif
   olunca GSC 16 ay, GA4 14 ay geriye backfill kuyruğa alınır.
5. **Keyword'ler** sekmesinden takip edilecek keyword'leri tek tek ya da toplu (metin/CSV)
   ekleyin; DataForSEO bilgileri girilmişse (`DFS_LOGIN`/`DFS_PASSWORD`) günlük/haftalık rank
   kontrolü otomatik başlar.
6. Veri akmaya başladıkça proje dashboard'unda GSC/GA4/rank özetleri, **Raporlar**
   sekmesinde PDF rapor oluşturma ve zamanlama, **Alertler** sekmesinde bildirim kuralları
   kullanılabilir olur.

## Seed script

GSC/GA4 bağlantısı ve DataForSEO bilgisi olmadan paneli dolu görmek için bir seed script'i
vardır (ARCHITECTURE §15). Yalnız `NODE_ENV=development`'ta çalışır:

```bash
bun run db:up
bun run db:migrate
bun run --filter api seed
```

Oluşturduğu veri: bir owner kullanıcı (`owner@demo.local` / `Demo1234!`), bir organizasyon
(`Demo Ajans`), iki client, üç proje, proje başına örnek keyword'ler ve 60 günlük gerçekçi
sahte GSC/GA4/rank verisi (`gsc_site_daily`, `gsc_page_daily`, `gsc_daily`, `ga4_daily`,
`rank_daily`); ardından `project_daily_summary` ve `keyword_rank_latest` bu veriden hesaplanır.

Tekrar çalıştırmak güvenlidir: mevcut kayıtlar `ON CONFLICT DO UPDATE` ile güncellenir, yeni
satır eklenmez. Demo org'u sıfırdan oluşturmak isterseniz:

```bash
bun run --filter api seed -- --reset
```
