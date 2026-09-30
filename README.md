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
