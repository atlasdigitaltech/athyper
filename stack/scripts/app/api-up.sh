#!/usr/bin/env bash
# ============================================================
# athyper - Backend API UP - Linux/macOS
# Location: stack/scripts/app/api-up.sh
# Usage:
#   ./api-up.sh              -> default API mode
#   ./api-up.sh worker       -> BullMQ worker mode
#   ./api-up.sh scheduler    -> scheduler mode
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> pnpm --filter @athyper/runtime-server dev[:<mode>]
#   staging    -> docker compose up -d --no-deps athyper-api
#   production -> docker compose up -d --no-deps athyper-api
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

REPO_ROOT="${STACK_DIR}/.."

MODE="${1:-api}"

init_compose_env || {
  echo "WARNING: .env not found at $ENV_FILE — defaulting to local mode."
}
ENVIRONMENT="${ENVIRONMENT:-local}"

echo ""
echo "=========================="
echo "ENVIRONMENT = $ENVIRONMENT"
echo "SERVICE     = athyper-api (@athyper/runtime-server)"
echo "MODE        = $MODE"
echo "=========================="
echo ""

# ----------------------------
# Local: run pnpm dev (foreground)
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  case "$MODE" in
    worker)    PNPM_SCRIPT="dev:worker" ;;
    scheduler) PNPM_SCRIPT="dev:scheduler" ;;
    *)         PNPM_SCRIPT="dev" ;;
  esac

  echo "Local mode: starting backend server"
  echo "  pnpm --filter @athyper/runtime-server $PNPM_SCRIPT"
  echo ""
  cd "$REPO_ROOT"
  pnpm --filter @athyper/runtime-server "$PNPM_SCRIPT"
  exit 0
fi

# ----------------------------
# Staging / Production: compose up
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose ... up -d --no-deps athyper-api"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps athyper-api
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps athyper-api
fi

echo ""
echo "API service is UP (env=$ENVIRONMENT)"
if [[ -f "$ENV_FILE" ]]; then
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-api
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-api
fi
echo ""
