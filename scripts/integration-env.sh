#!/usr/bin/env bash
# Starts (or stops) a throwaway Postgres + PostgREST pair that behaves like the
# Supabase REST API, for the integration tests in src/**/*.integration.test.ts.
#
#   scripts/integration-env.sh start   # then: npm run test:integration
#   scripts/integration-env.sh stop
#
# Needs Postgres server binaries (PG_BIN, default /usr/lib/postgresql/16/bin)
# and PostgREST: the POSTGREST_BIN binary (default "postgrest" on PATH), or
# Docker, which then runs the postgrest/postgrest image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${INTEGRATION_DIR:-${TMPDIR:-/tmp}/kiwi-integration}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
POSTGREST_BIN="${POSTGREST_BIN:-postgrest}"
PG_PORT="${PG_PORT:-54329}"
REST_PORT="${REST_PORT:-54330}"
JWT_SECRET="kiwi-integration-secret-at-least-32-chars"

# Postgres refuses to run as root: run its commands as the postgres user then.
as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi
}

stop() {
  if [ -f "$DIR/postgrest.pid" ]; then kill "$(cat "$DIR/postgrest.pid")" 2>/dev/null || true; rm -f "$DIR/postgrest.pid"; fi
  if command -v docker >/dev/null 2>&1; then docker rm -f kiwi-postgrest >/dev/null 2>&1 || true; fi
  if [ -d "$DIR/data" ]; then as_pg "$PG_BIN/pg_ctl -D $DIR/data -m fast stop" >/dev/null 2>&1 || true; fi
  rm -rf "$DIR"
}

start() {
  stop
  mkdir -p "$DIR"
  [ "$(id -u)" = "0" ] && chown postgres "$DIR"
  as_pg "$PG_BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
  as_pg "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PG_PORT -k /tmp -c listen_addresses=localhost -c wal_level=logical' -l $DIR/postgres.log -w start" >/dev/null
  psql() { command psql -q -v ON_ERROR_STOP=1 -h localhost -p "$PG_PORT" -U postgres "$@"; }
  psql -c "create database kiwi" >/dev/null
  psql -d kiwi -f "$ROOT/supabase/tests/supabase-stub.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do psql -d kiwi -f "$f" >/dev/null; done

  cat > "$DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:postgres@localhost:$PG_PORT/kiwi"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = $REST_PORT
CONF
  if command -v "$POSTGREST_BIN" >/dev/null 2>&1; then
    "$POSTGREST_BIN" "$DIR/postgrest.conf" >"$DIR/postgrest.log" 2>&1 &
    echo $! >"$DIR/postgrest.pid"
  else
    docker run -d --name kiwi-postgrest --network host \
      -e PGRST_DB_URI="postgres://authenticator:postgres@localhost:$PG_PORT/kiwi" \
      -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
      -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT="$REST_PORT" \
      postgrest/postgrest >/dev/null
  fi
  for _ in $(seq 1 50); do
    if curl -sf "http://localhost:$REST_PORT/" >/dev/null 2>&1; then
      echo "PostgREST ready on http://localhost:$REST_PORT (Postgres on $PG_PORT)"
      return
    fi
    sleep 0.2
  done
  echo "PostgREST did not start:" >&2
  cat "$DIR/postgrest.log" >&2 2>/dev/null || docker logs kiwi-postgrest >&2 2>/dev/null || true
  exit 1
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
