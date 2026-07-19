#!/usr/bin/env bash
# ============================================================
# athyper - Local Dev Bootstrap - Linux/macOS/WSL
# Location: stack/scripts/dev-local.sh
#
# Single canonical command for "Option C" local dev (host apps + Docker infra).
# Equivalent to running, by hand:
#   1. docker stop <any stale app containers>
#   2. stack/scripts/stack-profile/up.sh core
#   3. stack/scripts/app/api-up.sh             (terminal 2)
#   4. stack/scripts/app/web-up.sh all         (terminal 3, replaces local-ui-up)
#   5. (optional) api-up.sh worker, api-up.sh scheduler
#
# Usage:
#   ./dev-local.sh                : api + 3 web planes (foreground)
#   ./dev-local.sh --with-jobs    : also start worker + scheduler in background
#   ./dev-local.sh --no-infra     : skip stack-profile/up (infra already up)
#   ./dev-local.sh --stop-only    : just stop the 6 app containers, do nothing else
#
# Note: file attachments (Tika/docparser) require BOTH --with-jobs AND the
# render profile running. Start render separately first if needed:
#   stack/scripts/stack-profile/up.sh render
#
# Container naming: ${COMPOSE_PROJECT_NAME}-<svc>-1 (matches stack-service/stop.sh).
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${STACK_DIR}/env/.env"

WITH_JOBS=0
NO_INFRA=0
STOP_ONLY=0

usage() {
  cat <<EOF
Usage:
  $0 [--with-jobs] [--no-infra] [--stop-only]

Flags:
  --with-jobs   also start worker + scheduler in background
  --no-infra    skip stack-profile/up (infra already up)
  --stop-only   just stop the 6 app containers, do nothing else
EOF
}

for arg in "$@"; do
  case "$arg" in
    --with-jobs) WITH_JOBS=1 ;;
    --no-infra)  NO_INFRA=1 ;;
    --stop-only) STOP_ONLY=1 ;;
    -h|--help)   usage; exit 0 ;;
    *)           echo "ERROR: unsupported option: $arg" >&2; usage; exit 1 ;;
  esac
done

# Resolve COMPOSE_PROJECT_NAME (env > .env > "athyper")
if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  COMPOSE_PROJECT_NAME="$(grep -E '^COMPOSE_PROJECT_NAME=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-athyper}"

APP_CONTAINERS=(
  "${COMPOSE_PROJECT_NAME}-api-1"
  "${COMPOSE_PROJECT_NAME}-worker-1"
  "${COMPOSE_PROJECT_NAME}-scheduler-1"
  "${COMPOSE_PROJECT_NAME}-neon-web-1"
  "${COMPOSE_PROJECT_NAME}-mesh-web-1"
  "${COMPOSE_PROJECT_NAME}-admin-web-1"
)

echo ""
echo "=========================="
echo " athyper local dev bootstrap"
echo "=========================="
echo " COMPOSE_PROJECT_NAME = $COMPOSE_PROJECT_NAME"
echo " WITH_JOBS            = $WITH_JOBS"
echo " NO_INFRA             = $NO_INFRA"
echo " STOP_ONLY            = $STOP_ONLY"
echo "=========================="
echo ""

if ! docker version >/dev/null 2>&1; then
  echo "ERROR: Docker is not running." >&2
  exit 1
fi

# ----------------------------
# Step 1: Pre-stop stale app containers (silent if none running)
# ----------------------------
echo "[1/4] Stopping any stale app containers so host dev isn't shadowed..."
STALE_FOUND=0
for c in "${APP_CONTAINERS[@]}"; do
  if docker ps --format '{{.Names}}' --filter "name=^${c}$" | grep -qx "$c"; then
    echo "  docker stop $c"
    docker stop "$c" >/dev/null
    STALE_FOUND=1
  fi
done
if [[ "$STALE_FOUND" == "0" ]]; then
  echo "  (none running — clean start)"
fi
echo ""

if [[ "$STOP_ONLY" == "1" ]]; then
  echo "--stop-only: done."
  exit 0
fi

# ----------------------------
# Step 2: Bring up infra (core profile)
# ----------------------------
if [[ "$NO_INFRA" == "1" ]]; then
  echo "[2/4] Skipping infra bringup (--no-infra)."
else
  echo "[2/4] Starting infra (stack-profile/up.sh core)..."
  bash "${STACK_DIR}/scripts/stack-profile/up.sh" core
fi
echo ""

# ----------------------------
# Step 3+4: Run API + 3 web planes
# Background api (and optionally worker/scheduler), foreground web-up to wait
# on Ctrl+C. The cleanup trap stops the background pids.
# ----------------------------
BG_PIDS=()
cleanup() {
  echo ""
  echo "Stopping background dev processes..."
  for pid in "${BG_PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

echo "[3/4] Starting API host dev server (background)..."
bash "${STACK_DIR}/scripts/app/api-up.sh" &
BG_PIDS+=("$!")

if [[ "$WITH_JOBS" == "1" ]]; then
  echo "       Also starting worker + scheduler (--with-jobs)..."
  bash "${STACK_DIR}/scripts/app/api-up.sh" worker &
  BG_PIDS+=("$!")
  bash "${STACK_DIR}/scripts/app/api-up.sh" scheduler &
  BG_PIDS+=("$!")
fi
echo ""

echo "[4/4] Starting Neon + Mesh + Admin host dev servers (foreground)..."
echo "      Ctrl+C here will also stop the background api/worker/scheduler."
echo ""
bash "${STACK_DIR}/scripts/app/web-up.sh" all
