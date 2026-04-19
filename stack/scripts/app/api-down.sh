#!/usr/bin/env bash
# ============================================================
# athyper - Backend API DOWN - Linux/macOS
# Location: stack/scripts/app/api-down.sh
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints guidance (server runs in your terminal)
#   staging    -> docker compose stop athyper-api
#   production -> docker compose stop athyper-api
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

init_compose_env || {
  echo "WARNING: .env not found at $ENV_FILE — defaulting to local mode."
}
ENVIRONMENT="${ENVIRONMENT:-local}"

echo ""
echo "=========================="
echo "ENVIRONMENT = $ENVIRONMENT"
echo "SERVICE     = athyper-api (@athyper/runtime-server)"
echo "=========================="
echo ""

# ----------------------------
# Local: guidance only
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: the backend server runs in your terminal via 'pnpm dev'."
  echo "To stop: press Ctrl+C in that terminal."
  echo ""
  exit 0
fi

# ----------------------------
# Staging / Production: compose stop
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose ... stop athyper-api"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" stop athyper-api
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" stop athyper-api
fi

echo ""
echo "API service stopped (env=$ENVIRONMENT)"
echo ""
