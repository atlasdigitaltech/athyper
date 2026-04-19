#!/usr/bin/env bash
# ============================================================
# athyper - Backend API RESTART - Linux/macOS
# Location: stack/scripts/app/api-restart.sh
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints guidance (tsx watch handles hot reload)
#   staging    -> docker compose restart athyper-api
#   production -> docker compose restart athyper-api
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
# Local: guidance only — tsx watch handles hot reload
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: tsx watch handles hot reloads automatically."
  echo "For a hard restart: Ctrl+C in the dev terminal, then run api-up.sh."
  echo ""
  exit 0
fi

# ----------------------------
# Staging / Production: compose restart
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose ... restart athyper-api"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" restart athyper-api
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" restart athyper-api
fi

echo ""
echo "API service restarted (env=$ENVIRONMENT)"
if [[ -f "$ENV_FILE" ]]; then
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-api
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-api
fi
echo ""
