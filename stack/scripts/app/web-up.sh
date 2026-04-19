#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend UP - Linux/macOS
# Location: stack/scripts/app/web-up.sh
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> pnpm --filter @athyper/web dev   (foreground, HMR)
#   staging    -> docker compose up -d --no-deps athyper-neon-web
#   production -> docker compose up -d --no-deps athyper-neon-web
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

REPO_ROOT="${STACK_DIR}/.."

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
# Local: run pnpm dev (foreground)
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: starting Next.js dev server"
  echo "  pnpm --filter @athyper/web dev"
  echo ""
  cd "$REPO_ROOT"
  pnpm --filter @athyper/web dev
  exit 0
fi

# ----------------------------
# Staging / Production: compose up the specific service
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose ... up -d --no-deps athyper-neon-web"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps athyper-neon-web
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps athyper-neon-web
fi

echo ""
echo "Web service is UP (env=$ENVIRONMENT)"
if [[ -f "$ENV_FILE" ]]; then
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-neon-web
else
  docker compose --project-directory "$COMPOSE_DIR" \
    "${COMPOSE_FILE_ARGS[@]}" ps athyper-neon-web
fi
echo ""
