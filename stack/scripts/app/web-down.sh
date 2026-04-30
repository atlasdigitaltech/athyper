#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend DOWN - Linux/macOS
# Location: stack/scripts/app/web-down.sh
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints guidance (Next.js dev runs in your terminal)
#   staging    -> docker compose stop athyper-neon-web
#   production -> docker compose stop athyper-neon-web
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
# Local: guidance only
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: Next.js dev server runs in your terminal."
  echo "To stop: press Ctrl+C in the terminal running 'pnpm dev'."
  echo ""
  exit 0
fi

# ----------------------------
# Staging / Production: compose stop
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

echo "Running: docker compose ... stop athyper-neon-web"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" stop athyper-neon-web

echo ""
echo "Web service stopped (env=$ENVIRONMENT)"
echo ""
