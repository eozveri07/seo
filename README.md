# seo

Çok kiracılı SEO takip ve otomasyon platformu. Bkz. `CLAUDE.md` ve `docs/`.

## Başlangıç

```bash
bun install
cp .env.example .env
bun run db:up         # Postgres + Redis (docker compose)
bun run dev:api       # API, :3000
bun run dev:panel     # panel, :5173
```

`.nakres/agent.yml`, nakres önizleme ve QA için uygulamanın nasıl başlatılacağını (kurulum, dev komutu ve portu) tanımlar.
