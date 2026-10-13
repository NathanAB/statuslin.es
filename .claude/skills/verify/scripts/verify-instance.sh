#!/usr/bin/env bash
# Verification instance for statuslin.es: its own dev server, its own Postgres database, its own
# browser sessions. Never touches the user's dev server, the `statuslines` dev database, or a
# process it didn't start.
#
#   verify-instance.sh up                 create DB, migrate, seed users, start server, wait ready
#   verify-instance.sh doctor             read-only: is this instance worth driving?
#   verify-instance.sh login <role>       sign a browser session in (role: admin | author)
#   verify-instance.sh ab <role> <args>   agent-browser in that role's session (role: anon | admin | author)
#   verify-instance.sh errors <role>      page errors + console errors since the last call, then clear them
#   verify-instance.sh copy-spy <role>    record clipboard writes on the open page (re-run after navigating)
#   verify-instance.sh copied <role>      print the last text the page wrote to the clipboard
#   verify-instance.sh sql "<query>"      run SQL against the verify DB (for side-effect checks)
#   verify-instance.sh db-url             print the verify DB's DATABASE_URL (for repo scripts)
#   verify-instance.sh evidence <feature> make and print a fresh evidence dir for one proof
#   verify-instance.sh down               stop server, close sessions, drop the DB; keeps evidence
#
# VERIFY_PORT (default 3110) picks the port. The DB and browser session names also carry a hash of
# this checkout's path, so another checkout or worktree can never drive or drop this instance.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PORT="${VERIFY_PORT:-3110}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "verify: VERIFY_PORT must be a number" >&2; exit 1; }
CHECKOUT="$(printf '%s' "$REPO_ROOT" | shasum | cut -c1-6)"
CONTAINER=statuslines-postgres # the local Postgres container (CLAUDE.md, README §1)
DB="statuslines_verify_${PORT}_${CHECKOUT}"
BASE="http://localhost:${PORT}"
RUN_DIR="${REPO_ROOT}/.verify/run/${PORT}"
EVIDENCE_ROOT="${REPO_ROOT}/.verify/evidence"
PID_FILE="${RUN_DIR}/server.pid"
STARTED_FILE="${RUN_DIR}/server.started" # the process start time, so a reused PID never matches
LOG_FILE="${RUN_DIR}/server.log"
SESSION_PREFIX="statuslines-verify-${PORT}-${CHECKOUT}"
ADMIN_EMAIL=verify-admin@test.invalid
AUTHOR_EMAIL=verify-author@test.invalid

die() { echo "verify: $*" >&2; exit 1; }

env_local() { grep -E "^$1=" "${REPO_ROOT}/.env.local" 2>/dev/null | head -1 | cut -d= -f2- || true; }

# DATABASE_URL for the verify DB: the dev URL from .env.local with its database name swapped.
database_url() {
  local dev_url
  dev_url="$(env_local DATABASE_URL)"
  [[ -n "$dev_url" ]] || die ".env.local has no DATABASE_URL (see README §2)"
  echo "${dev_url%/*}/${DB}"
}

# The user's dev server port, derived from BETTER_AUTH_URL like vite.config.ts does.
dev_port() { env_local BETTER_AUTH_URL | sed -nE 's#^https?://[^/:]+:([0-9]+).*#\1#p'; }

postgres_up() { docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; }
psql_verify() { docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -Atc "$1"; }
psql_admin() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -Atc "$1"; }

# Our server's PID, only if the PID file's process is alive AND started when we recorded it.
our_server_pid() {
  [[ -f "$PID_FILE" && -f "$STARTED_FILE" ]] || return 0
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null || return 0
  [[ "$(ps -o lstart= -p "$pid" 2>/dev/null)" == "$(cat "$STARTED_FILE")" ]] && echo "$pid"
  return 0
}
server_alive() { [[ -n "$(our_server_pid)" ]]; }
listener_pids() { lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; }
healthy() { curl -fsS --max-time 3 "${BASE}/api/health" 2>/dev/null | grep -q '"ok":true'; }

# The server is its own process group (pgid == its pid), so "owned by us" = the listener's pgid matches.
port_owned_by_us() {
  local pid owner
  pid="$(our_server_pid)"
  [[ -n "$pid" ]] || return 1
  for owner in $(listener_pids); do
    [[ "$(ps -o pgid= -p "$owner" | tr -d ' ')" == "$pid" ]] && return 0
  done
  return 1
}

migrations_expected() { find "${REPO_ROOT}/drizzle" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' '; }
migrations_applied() { psql_verify 'SELECT count(*) FROM drizzle.__drizzle_migrations' 2>/dev/null || echo 0; }
db_ready() { [[ "$(migrations_applied)" == "$(migrations_expected)" ]]; }

cmd_up() {
  [[ "$PORT" != "$(dev_port)" ]] || die "port $PORT is the dev server's (BETTER_AUTH_URL in .env.local); pick another VERIFY_PORT"
  postgres_up || die "Postgres container '$CONTAINER' is not running (docker start $CONTAINER)"
  if server_alive; then
    if port_owned_by_us && healthy && db_ready; then
      echo "verify: already up at $BASE (pid $(our_server_pid), db $DB)"
      return 0
    fi
    die "our server (pid $(our_server_pid)) is still starting or is unhealthy; run down, then up"
  fi
  rm -rf "$RUN_DIR" # a stale PID file from a crash or reboot; its PID is not ours any more
  [[ -z "$(listener_pids)" ]] || die "port $PORT is in use by a process this helper did not start (pid $(listener_pids | tr '\n' ' ')); pick another VERIFY_PORT"
  mkdir -p "$RUN_DIR"

  # Fresh database every run: drop leftovers from a crashed run, then migrate the committed schema.
  psql_admin "DROP DATABASE IF EXISTS ${DB} WITH (FORCE)" >/dev/null
  psql_admin "CREATE DATABASE ${DB}" >/dev/null
  local url
  url="$(database_url)"
  (cd "$REPO_ROOT" && DATABASE_URL="$url" bun run db:migrate >"${RUN_DIR}/migrate.log" 2>&1) ||
    die "migration failed; see ${RUN_DIR}/migrate.log"

  # Disposable users. GitHub OAuth can't be driven headlessly; `login` mints sessions for these.
  psql_verify "INSERT INTO \"user\" (id, name, email, email_verified, role, username) VALUES
    ('verify-admin', 'Verify Admin', '${ADMIN_EMAIL}', true, 'admin', 'verify-admin'),
    ('verify-author', 'Verify Author', '${AUTHOR_EMAIL}', true, 'user', 'verify-author')" >/dev/null

  # perl setpgrp makes the server its own process group so `down` kills vite's node child too.
  # --strictPort: fail instead of drifting to the next port. Empty keys keep email and analytics
  # off even if .env.local sets them (Bun doesn't refill a variable that is set but empty).
  (
    cd "$REPO_ROOT"
    DATABASE_URL="$url" BETTER_AUTH_URL="$BASE" RENDER_RUNNER=fake RESEND_API_KEY='' POSTHOG_PROJECT_TOKEN='' \
      nohup perl -e 'setpgrp(0, 0); exec @ARGV' bun run dev --strictPort >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  ps -o lstart= -p "$(cat "$PID_FILE")" >"$STARTED_FILE"

  for _ in $(seq 1 90); do
    if healthy; then
      port_owned_by_us || die "another process answered on port $PORT; run down"
      echo "verify: up at $BASE (pid $(our_server_pid), db $DB, log $LOG_FILE)"
      return 0
    fi
    server_alive || die "server exited during startup; see $LOG_FILE (then run down)"
    sleep 1
  done
  die "server not healthy after 90s; see $LOG_FILE (then run down)"
}

server_env_has() { ps eww -p "$(our_server_pid)" 2>/dev/null | grep -Eq "(^| )$1( |$)"; }

cmd_doctor() {
  local failed=0 applied expected
  check() { if "${@:2}"; then echo "  ok   $1"; else echo "  FAIL $1"; failed=1; fi; }
  applied="$(migrations_applied)"
  expected="$(migrations_expected)"
  echo "verify doctor ($BASE, db $DB, sessions ${SESSION_PREFIX}-<role>)"
  check "server process alive and ours (pid $(our_server_pid))" server_alive
  check "port $PORT owned by our server" port_owned_by_us
  check "GET /api/health returns ok" healthy
  check "postgres container up" postgres_up
  check "migrations applied ($applied/$expected)" test "$applied" == "$expected"
  check "seeded admin + author users" test \
    "$(psql_verify "SELECT count(*) FROM \"user\" WHERE id IN ('verify-admin','verify-author')" 2>/dev/null || echo 0)" == 2
  check "server env: DATABASE_URL -> $DB" server_env_has "DATABASE_URL=[^ ]*/${DB}"
  check "server env: RENDER_RUNNER=fake" server_env_has 'RENDER_RUNNER=fake'
  check "server env: RESEND_API_KEY and POSTHOG_PROJECT_TOKEN empty" \
    eval 'server_env_has RESEND_API_KEY= && server_env_has POSTHOG_PROJECT_TOKEN='
  if [[ $failed == 0 ]]; then
    echo "verify doctor: healthy"
  else
    echo "verify doctor: NOT healthy — run down, then up"
    return 1
  fi
}

ab() {
  local role="${1:-}"
  [[ "$role" =~ ^(anon|admin|author)$ ]] || die "role must be anon, admin or author"
  shift
  # agent-browser resolves a relative path against its daemon's working directory, which may not
  # be this one. Make a relative image path (the last argument) absolute.
  if [[ "${1:-}" == screenshot && $# -ge 2 ]]; then
    local last="${!#}"
    if [[ "$last" != /* && "$last" =~ \.(png|jpe?g)$ ]]; then
      set -- "${@:1:$(($# - 1))}" "$PWD/$last"
    fi
  fi
  agent-browser --session "${SESSION_PREFIX}-${role}" "$@"
}

cmd_login() {
  local role="${1:-}" email out cookie
  case "$role" in
    admin) email="$ADMIN_EMAIL" ;;
    author) email="$AUTHOR_EMAIL" ;;
    *) die "usage: login admin|author" ;;
  esac
  out="$(cd "$REPO_ROOT" && DATABASE_URL="$(database_url)" BETTER_AUTH_URL="$BASE" bun run dev:login "$email")"
  cookie="$(sed -n 's/^better-auth.session_token=//p' <<<"$out")"
  [[ -n "$cookie" ]] || die "dev:login printed no cookie"
  ab "$role" open "${BASE}/api/health" >/dev/null
  ab "$role" cookies set better-auth.session_token "$cookie" --url "$BASE" --httpOnly >/dev/null
  echo "verify: session ${SESSION_PREFIX}-${role} signed in as $email"
}

# Same console filter as scripts/smoke.ts: real errors and hydration warnings, minus dev noise.
cmd_errors() {
  local role="${1:-}" page console
  page="$(ab "$role" errors)"
  console="$(ab "$role" console | grep -Ei '\[(error|console\.error)\]|SyntaxError|hydrat|did not match' |
    grep -Eiv 'React DevTools|\[vite\] (connecting|connected)|Download the React' || true)"
  ab "$role" errors --clear >/dev/null
  ab "$role" console --clear >/dev/null
  if [[ -z "$page$console" ]]; then
    echo "no page or console errors"
  else
    printf '%s\n%s\n' "$page" "$console" | sed '/^$/d'
    return 1
  fi
}

cmd_evidence() {
  local feature="${1:-}" base dir n=1
  [[ -n "$feature" ]] || die "usage: evidence <feature-id>"
  base="${EVIDENCE_ROOT}/${feature}/$(date -u +%Y%m%dT%H%M%SZ)"
  dir="$base"
  while [[ -e "$dir" ]]; do n=$((n + 1)); dir="${base}-${n}"; done
  mkdir -p "$dir"
  echo "$dir"
}

cmd_down() {
  local role pid
  for role in anon admin author; do
    agent-browser --session "${SESSION_PREFIX}-${role}" close >/dev/null 2>&1 || true
  done
  pid="$(our_server_pid)"
  if [[ -n "$pid" ]]; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL -- "-$pid" 2>/dev/null || true
    echo "verify: stopped server (pid $pid)"
  elif [[ -f "$PID_FILE" ]]; then
    echo "verify: stale PID file (pid $(cat "$PID_FILE") is not our server any more); killed nothing"
  fi
  if postgres_up; then
    psql_admin "DROP DATABASE IF EXISTS ${DB} WITH (FORCE)" >/dev/null
    echo "verify: dropped db $DB"
  else
    echo "verify: Postgres container is down; db $DB was not dropped (run down again once it's up)" >&2
  fi
  rm -rf "$RUN_DIR"
  rmdir "${REPO_ROOT}/.verify/run" 2>/dev/null || true
  if [[ -n "$pid" && -n "$(listener_pids)" ]]; then
    echo "verify: WARNING port $PORT still has a listener after stopping our server (pid $(listener_pids | tr '\n' ' '))" >&2
  fi
  echo "verify: down; evidence kept in $EVIDENCE_ROOT"
}

case "${1:-}" in
  up) cmd_up ;;
  doctor) cmd_doctor ;;
  login) cmd_login "${2:-}" ;;
  ab) shift; ab "$@" ;;
  errors) cmd_errors "${2:-}" ;;
  # Headless Chrome denies clipboard reads, so wrap writeText (it still writes) and keep the text.
  copy-spy) ab "${2:-}" eval 'window.__verifyCopied = window.__verifyCopied || []; if (!window.__verifyCopySpy) { const write = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (text) => { window.__verifyCopied.push(text); return write(text) }; window.__verifyCopySpy = true } "copy spy on"' ;;
  # eval prints a JSON string; decode it so this prints the exact copied text.
  copied) ab "${2:-}" eval '(window.__verifyCopied || []).at(-1) ?? "(nothing copied since copy-spy)"' |
    bun -e 'process.stdout.write(JSON.parse((await Bun.stdin.text()).trim()) + "\n")' ;;
  sql) [[ -n "${2:-}" ]] || die 'usage: sql "<query>"'; psql_verify "$2" ;;
  db-url) database_url ;;
  evidence) cmd_evidence "${2:-}" ;;
  down) cmd_down ;;
  *) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
