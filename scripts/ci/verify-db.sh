#!/usr/bin/env bash
#
# Postgres (pgvector + pg_partman) ve Redis'e karşı migration, seed, e2e ve
# açılış akışını uçtan uca doğrular. Lokalde `bun run ci:db` ile, workflow
# izni verildiğinde CI'da da aynı script'le çalışır. bkz. README "DB
# doğrulaması", docs/ARCHITECTURE.md §15.
#
# Kullanım: bun run ci:db [-- --down]
#   --down   bitince `docker compose down` çalıştırır (volume'lar kalır).
#            Verilmezse Postgres/Redis container'ları ayakta kalır.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
LOG_DIR="$ROOT_DIR/.ci-logs"
MAIN_LOG="$LOG_DIR/main.log"
WORKER_LOG="$LOG_DIR/worker.log"
ENV_FILE="$ROOT_DIR/.env"
TEST_DATABASE_URL="postgres://seo:seo@localhost:5432/seo_test"
HEALTH_URL="http://localhost:3000/api/v1/health"
HEALTH_WAIT_SECONDS=30
WORKER_ALIVE_SECONDS=15

DOWN_AFTER=false
for arg in "$@"; do
  case "$arg" in
    --down)
      DOWN_AFTER=true
      ;;
    *)
      echo "Bilinmeyen argüman: $arg" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR"

MAIN_PID=""
WORKER_PID=""

log_step() {
  echo
  echo "== $1 =="
}

fail() {
  echo "HATA: $1" >&2
  exit 1
}

on_error() {
  echo "HATA: adım başarısız (satır $1): $2" >&2
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

stop_pid() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  local status=$?
  stop_pid "$WORKER_PID"
  stop_pid "$MAIN_PID"
  if [[ "$DOWN_AFTER" == true ]]; then
    log_step "docker compose down"
    docker compose down || true
  fi
  exit "$status"
}
trap cleanup EXIT

pg_exec() {
  local db="$1"
  shift
  docker compose exec -T postgres psql -U seo -d "$db" -v ON_ERROR_STOP=1 -tA "$@"
}

extensions_present() {
  local db="$1"
  local ext
  for ext in vector pg_trgm unaccent pg_partman; do
    local count
    count="$(pg_exec "$db" -c "SELECT count(*) FROM pg_extension WHERE extname = '$ext'" | tr -d '[:space:]')"
    [[ "$count" == "1" ]] || return 1
  done
  return 0
}

partman_tables_registered() {
  local db="$1"
  local table
  for table in gsc_daily gsc_page_daily ga4_daily rank_daily; do
    local count
    count="$(pg_exec "$db" -c "SELECT count(*) FROM partman.part_config WHERE parent_table = 'public.$table'" | tr -d '[:space:]')"
    [[ "$count" == "1" ]] || return 1
  done
  return 0
}

migrations_applied_count() {
  local db="$1"
  pg_exec "$db" -c "SELECT CASE WHEN to_regclass('public.migrations') IS NULL THEN 0 ELSE (SELECT count(*) FROM migrations) END" | tr -d '[:space:]'
}

# --- 1. Postgres + Redis -----------------------------------------------
log_step "1/7 docker compose up (postgres, redis)"
docker compose up -d --wait postgres redis

# --- 2. .env --------------------------------------------------------------
log_step "2/7 .env"
if [[ -f "$ENV_FILE" ]]; then
  echo "Var olan .env kullanılıyor, ezilmiyor."
else
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  for key in ENCRYPTION_KEY JWT_ACCESS_SECRET REPORT_TOKEN_SECRET; do
    value="$(openssl rand -base64 32)"
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  done
  echo ".env .env.example'dan üretildi, secret'lar openssl ile dolduruldu."
fi

# --- 3. Temiz DB'de migrate ------------------------------------------------
log_step "3/7 migrate + extension/partman kontrolü (seo)"
bun run db:migrate
extensions_present seo || fail "beklenen extension'lar kurulu değil (vector/pg_trgm/unaccent/pg_partman), seo"
partman_tables_registered seo || fail "partman.part_config'te eksik tablo var (gsc_daily/gsc_page_daily/ga4_daily/rank_daily), seo"

# --- 4. Tüm migration'ları geri al, sonra yeniden uygula -------------------
log_step "4/7 revert döngüsü + yeniden migrate (seo)"
MIGRATION_FILE_COUNT="$(find "$API_DIR/src/database/migrations" -name '*.ts' | wc -l | tr -d '[:space:]')"
revert_iterations=0
while [[ "$(migrations_applied_count seo)" != "0" ]]; do
  revert_iterations=$((revert_iterations + 1))
  if [[ "$revert_iterations" -gt "$MIGRATION_FILE_COUNT" ]]; then
    fail "migration revert döngüsü $MIGRATION_FILE_COUNT denemede bitmedi, muhtemelen döngü"
  fi
  bun run db:revert
done
extensions_present seo && fail "revert sonrası extension'lar hâlâ kurulu (seo)"
partman_tables_registered seo && fail "revert sonrası partman.part_config kayıtları hâlâ var (seo)"

bun run db:migrate
extensions_present seo || fail "yeniden migrate sonrası extension'lar kurulu değil (seo)"
partman_tables_registered seo || fail "yeniden migrate sonrası partman.part_config kayıtları eksik (seo)"

# --- 5. Seed (iki kez, ikincisi --reset) -----------------------------------
log_step "5/7 seed (iki kez, --reset ile)"
(cd "$ROOT_DIR" && NODE_ENV=development bun run --filter api seed)
(cd "$ROOT_DIR" && NODE_ENV=development bun run --filter api seed -- --reset)

owner_count="$(pg_exec seo -c "SELECT count(*) FROM users WHERE email = 'owner@demo.local'" | tr -d '[:space:]')"
[[ "$owner_count" == "1" ]] || fail "seed sonrası owner kullanıcı sayısı 1 değil: $owner_count"

org_count="$(pg_exec seo -c "SELECT count(*) FROM organizations WHERE slug = 'demo-ajans'" | tr -d '[:space:]')"
[[ "$org_count" == "1" ]] || fail "seed sonrası org sayısı 1 değil: $org_count"

client_count="$(pg_exec seo -c "SELECT count(*) FROM clients WHERE org_id = (SELECT id FROM organizations WHERE slug = 'demo-ajans')" | tr -d '[:space:]')"
[[ "$client_count" == "2" ]] || fail "seed sonrası client sayısı 2 değil: $client_count"

project_count="$(pg_exec seo -c "SELECT count(*) FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'demo-ajans')" | tr -d '[:space:]')"
[[ "$project_count" == "3" ]] || fail "seed sonrası proje sayısı 3 değil: $project_count"

for table in gsc_site_daily rank_daily project_daily_summary keyword_rank_latest; do
  row_count="$(pg_exec seo -c "SELECT count(*) FROM \"$table\"" | tr -d '[:space:]')"
  [[ "$row_count" -gt "0" ]] || fail "seed sonrası \"$table\" boş"
done

# --- 6. e2e (seo_test) ------------------------------------------------------
log_step "6/7 e2e testleri (seo_test)"
pg_exec postgres -c "DROP DATABASE IF EXISTS seo_test"
pg_exec postgres -c "CREATE DATABASE seo_test OWNER seo"
(cd "$ROOT_DIR" && DATABASE_URL="$TEST_DATABASE_URL" bun run --filter api migration:run)
(cd "$ROOT_DIR" && E2E_DATABASE=true DATABASE_URL="$TEST_DATABASE_URL" DATABASE_SKIP_INITIALIZATION=false bun run --filter api test:e2e)

# --- 7. API + worker açılış testi -------------------------------------------
log_step "7/7 API ve worker açılış testi"
(cd "$API_DIR" && exec node dist/main.js) >"$MAIN_LOG" 2>&1 &
MAIN_PID=$!
(cd "$API_DIR" && exec env SCHEDULER_ENABLED=true node dist/worker.js) >"$WORKER_LOG" 2>&1 &
WORKER_PID=$!

health_body=""
health_ok=false
for ((i = 0; i < HEALTH_WAIT_SECONDS; i++)); do
  if ! kill -0 "$MAIN_PID" 2>/dev/null; then
    fail "API, health kontrolünden önce çıktı, bkz. $MAIN_LOG"
  fi
  response="$(curl -s -w '\n%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
  code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [[ "$code" == "200" ]]; then
    health_body="$body"
    health_ok=true
    break
  fi
  sleep 1
done
[[ "$health_ok" == true ]] || fail "GET $HEALTH_URL $HEALTH_WAIT_SECONDS sn içinde 200 dönmedi, bkz. $MAIN_LOG"

echo "$health_body" | grep -q '"status":"ok"' \
  || fail "health 'status: ok' dönmedi: $health_body"
up_count="$(echo "$health_body" | grep -o '"status":"up"' | wc -l | tr -d '[:space:]')"
[[ "$up_count" -ge 2 ]] \
  || fail "health iki bağımlılık kontrolünde de 'up' dönmedi: $health_body"
echo "API health OK: $health_body"

echo "Worker'ın $WORKER_ALIVE_SECONDS sn ayakta kalması bekleniyor..."
sleep "$WORKER_ALIVE_SECONDS"
kill -0 "$WORKER_PID" 2>/dev/null \
  || fail "worker $WORKER_ALIVE_SECONDS sn içinde durdu, bkz. $WORKER_LOG"

echo "SIGTERM gönderiliyor (API, worker)..."
kill -TERM "$MAIN_PID" 2>/dev/null || true
kill -TERM "$WORKER_PID" 2>/dev/null || true
wait "$MAIN_PID" 2>/dev/null || true
set +e
wait "$WORKER_PID"
worker_exit=$?
set -e
MAIN_PID=""
WORKER_PID=""
[[ "$worker_exit" -eq 0 ]] \
  || fail "worker SIGTERM sonrası 0 çıkış kodu vermedi (çıkış: $worker_exit), bkz. $WORKER_LOG"

echo
echo "Tüm doğrulama adımları geçti."
