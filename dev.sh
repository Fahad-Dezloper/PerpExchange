#!/usr/bin/env bash
#
# dev.sh — bring up the whole PerpExchange stack.
#
#   ./dev.sh              infra + all services, one terminal tab each
#   ./dev.sh --setup      also run `bun install` + prisma generate/migrate first
#   ./dev.sh --infra      only Redis + Postgres, no service tabs
#   ./dev.sh --no-front   skip the Next.js frontend tab
#   ./dev.sh --tmux       use tmux windows instead of iTerm tabs (no macOS perms)
#   ./dev.sh --stop       stop the docker containers and free the service ports
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# name | dir (relative to ROOT) | command | seconds to wait before starting
# The engine goes first: it owns the Redis consumer groups the others attach to.
SERVICES=(
  "engine|apps/engine|cargo run|0"
  "backend|apps/backend|bun run index.ts|4"
  "poller|apps/poller|bun run index.ts|5"
  "ws|apps/ws|bun run index.ts|5"
  "liquidation|apps/LiquidationPoller|bun run index.ts|6"
  "funding|apps/funding-ticker|bun run index.ts|6"
  "frontend|apps/frontend|bun run dev|6"
)

PORTS=(3000 3001 3002)

SETUP=0
INFRA_ONLY=0
NO_FRONTEND=0
STOP=0
USE_TMUX=0

for arg in "$@"; do
  case "$arg" in
    --setup)    SETUP=1 ;;
    --infra)    INFRA_ONLY=1 ;;
    --no-front) NO_FRONTEND=1 ;;
    --tmux)     USE_TMUX=1 ;;
    --stop)     STOP=1 ;;
    -h|--help)  awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' \
                    "${BASH_SOURCE[0]}"; exit 0 ;;
    *)          echo "unknown flag: $arg (try --help)" >&2; exit 1 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  !!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror\033[0m %s\n' "$*" >&2; exit 1; }

# ── stop ────────────────────────────────────────────────────────────────────
if [ "$STOP" -eq 1 ]; then
  say "stopping containers"
  docker stop perp-redis perp-postgres >/dev/null 2>&1 || true
  ok "perp-redis, perp-postgres stopped"

  say "freeing service ports"
  for p in "${PORTS[@]}"; do
    pids="$(lsof -ti "tcp:$p" 2>/dev/null || true)"
    [ -n "$pids" ] && kill $pids 2>/dev/null && ok "port $p" || true
  done
  warn "the Rust engine has no port — close its tab, or: pkill -f 'target/debug/engine'"
  exit 0
fi

# ── infra ───────────────────────────────────────────────────────────────────
docker info >/dev/null 2>&1 || die "Docker isn't running. Start Docker Desktop and retry."

say "starting infra"
docker start perp-redis >/dev/null 2>&1 \
  || docker run -d --name perp-redis -p 6379:6379 redis >/dev/null
docker start perp-postgres >/dev/null 2>&1 \
  || docker run -d --name perp-postgres -p 5432:5432 \
       -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=perp postgres >/dev/null

say "waiting for redis + postgres"
for i in $(seq 1 30); do
  redis_up=0; pg_up=0
  docker exec perp-redis redis-cli ping 2>/dev/null | grep -q PONG && redis_up=1
  docker exec perp-postgres pg_isready -q 2>/dev/null && pg_up=1
  if [ "$redis_up" -eq 1 ] && [ "$pg_up" -eq 1 ]; then
    ok "redis :6379, postgres :5432"
    break
  fi
  [ "$i" -eq 30 ] && die "infra never came up (redis=$redis_up postgres=$pg_up)"
  sleep 1
done

# ── optional setup ──────────────────────────────────────────────────────────
if [ "$SETUP" -eq 1 ]; then
  say "bun install"
  (cd "$ROOT" && bun install)
  say "prisma generate + migrate deploy"
  (cd "$ROOT/packages/db" && bun run prisma generate && bun run prisma migrate deploy)
  ok "deps + schema ready"
fi

if [ "$INFRA_ONLY" -eq 1 ]; then
  ok "infra only — done"
  exit 0
fi

# ── build the tab list ──────────────────────────────────────────────────────
NAMES=(); CMDS=()
for svc in "${SERVICES[@]}"; do
  IFS='|' read -r name dir cmd delay <<< "$svc"
  [ "$NO_FRONTEND" -eq 1 ] && [ "$name" = "frontend" ] && continue
  [ -d "$ROOT/$dir" ] || { warn "skipping $name — $dir not found"; continue; }
  prefix=""
  [ "$delay" -gt 0 ] && prefix="sleep $delay; "
  NAMES+=("$name")
  CMDS+=("${prefix}cd '$ROOT/$dir' && $cmd")
done

[ "${#NAMES[@]}" -gt 0 ] || die "no services to start"

# ── open a tab per service ──────────────────────────────────────────────────
open_iterm() {
  # Address iTerm by bundle id — `tell application "iTerm2"` fails to resolve
  # the scripting terminology (the bundle on disk is iTerm.app).
  local script='tell application id "com.googlecode.iterm2"
  activate
  set w to (create window with default profile)
'
  for i in "${!NAMES[@]}"; do
    if [ "$i" -eq 0 ]; then
      script+='  tell current session of w
'
    else
      script+='  tell w
    create tab with default profile
  end tell
  tell current session of current tab of w
'
    fi
    script+="    set name to \"${NAMES[$i]}\"
    write text \"${CMDS[$i]}\"
  end tell
"
  done
  script+='end tell'
  osascript -e "$script"
}

open_terminal_app() {
  local script='tell application "Terminal"
  activate
  do script "'"${CMDS[0]}"'"
  set custom title of front window to "'"${NAMES[0]}"'"
end tell
'
  for i in "${!NAMES[@]}"; do
    [ "$i" -eq 0 ] && continue
    script+='tell application "System Events" to keystroke "t" using command down
delay 0.4
tell application "Terminal"
  do script "'"${CMDS[$i]}"'" in front window
  set custom title of front window to "'"${NAMES[$i]}"'"
end tell
'
  done
  osascript -e "$script"
}

open_tmux() {
  local session="perp"
  tmux kill-session -t "$session" 2>/dev/null || true
  tmux new-session -d -s "$session" -n "${NAMES[0]}" -c "$ROOT"
  tmux send-keys -t "$session:${NAMES[0]}" "${CMDS[0]}" C-m
  for i in "${!NAMES[@]}"; do
    [ "$i" -eq 0 ] && continue
    tmux new-window -t "$session" -n "${NAMES[$i]}" -c "$ROOT"
    tmux send-keys -t "$session:${NAMES[$i]}" "${CMDS[$i]}" C-m
  done
  tmux select-window -t "$session:${NAMES[0]}"
  if [ -n "${TMUX:-}" ]; then
    ok "tmux session '$session' created — switch with: tmux switch-client -t $session"
  else
    tmux attach-session -t "$session"
  fi
}

say "opening ${#NAMES[@]} tabs: ${NAMES[*]}"
if [ "$USE_TMUX" -eq 1 ]; then
  command -v tmux >/dev/null || die "--tmux given but tmux isn't installed"
  open_tmux
elif [ -d /Applications/iTerm.app ]; then
  # First run triggers a macOS Automation permission prompt — click Allow.
  open_iterm
else
  warn "iTerm2 not found, using Terminal.app (needs Accessibility permission for tabs)"
  open_terminal_app
fi

ok "stack starting — engine boots first, the rest follow a few seconds behind"
echo "   backend  http://localhost:3000"
echo "   ws       ws://localhost:3001"
echo "   frontend http://localhost:3002"
echo "   stop it all with: ./dev.sh --stop"
