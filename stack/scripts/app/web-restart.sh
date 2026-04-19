#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend RESTART - Linux/macOS
# Location: stack/scripts/app/web-restart.sh
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints guidance (HMR active; hard restart via Ctrl+C + web-up)
#   staging    -> docker compose restart athyper-neon-web
#   production -> docker compose restart athyper-neon-web
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
echo "SERVICE     = athyper-neon-web (@athyper/web)"
echo "=========================="
echo ""

# ----------------------------
# Local: guidance only — HMR handles most restarts
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: Next.js HMR handles hot reloads automatically."
  echo "For a hard restart: Ctrl+C in the dev terminal, then run web-up.sh."
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
  echo "Running: docker compose ... restart athyper-neon-web"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" restart athyper-neon-web
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" restart athyper-neon-web
fi

echo ""
echo "Web service restarted (env=$ENVIRONMENT)"
if [[ -f "$ENV_FILE" ]]; then
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-neon-web
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-neon-web
fi
echo ""
