# seo

Çok kiracılı SEO takip ve otomasyon platformu. Bkz. `CLAUDE.md` ve `docs/`.

## Başlangıç

```bash
bun install
cp .env.example .env
bun run db:up         # Postgres + Redis (docker compose)
bun run db:migrate    # migration'ları uygula
bun run dev:api       # API, :3000
bun run dev:panel     # panel, :5173
```

`.nakres/agent.yml`, nakres önizleme ve QA için uygulamanın nasıl başlatılacağını (kurulum, dev komutu ve portu) tanımlar.

### `ENCRYPTION_KEY` üretme

`CryptoService` secret'ları (service account JSON, OAuth token, API key) AES-256-GCM ile
şifreler. `.env`'deki `ENCRYPTION_KEY` 32 byte'lık, base64 ile kodlanmış bir anahtar olmalı ve
uygulama bu değer olmadan ya da yanlış uzunlukta açılmaz:

```bash
openssl rand -base64 32
```

Çıktıyı `.env`'de `ENCRYPTION_KEY=` değerine yapıştırın.

### `JWT_ACCESS_SECRET` ve `JWT_ACCESS_TTL`

Access JWT'leri `JWT_ACCESS_SECRET` ile imzalanır (HS256, en az 32 karakter) ve
`JWT_ACCESS_TTL` saniye geçerlidir (varsayılan önerisi 900, yani 15 dakika). İkisi de zorunlu;
uygulama bunlar olmadan açılmaz:

```bash
openssl rand -base64 32
```

İlk kullanıcı, veritabanında hiç kullanıcı yokken `POST /api/v1/auth/register` ile oluşturulur;
sonraki kullanıcılar davetle gelir (T1.2).

### Raporlar: Playwright/chromium ve `REPORT_TOKEN_SECRET` (T1.15)

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
