#!/usr/bin/env bash
# ============================================================
# athyper - Backend API UP - Linux/macOS
# Location: stack/scripts/app/api-up.sh
# Usage:
#   ./api-up.sh              -> default API mode
#   ./api-up.sh worker       -> BullMQ worker mode
#   ./api-up.sh scheduler    -> scheduler mode
#
# Behaviour (auto-detected from ENVIRONMENT in stack/env/.env):
#   local      -> load stack/env/.env, translate Docker hostnames → 127.0.0.1,
#                 then: pnpm --filter @athyper/runtime-server dev[:<mode>]
#   staging    -> docker compose up -d --no-deps athyper-api
#   production -> docker compose up -d --no-deps athyper-api
#
# Single source of truth: stack/env/.env is the only env file needed.
# server/.env is NOT required — this script injects all vars directly.
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
# Local: load stack .env, translate Docker hostnames, run pnpm dev
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

  # Load all vars from stack/env/.env and export them to the environment.
  # Raw line-by-line parse — avoids $$ → PID expansion that `source` triggers
  # and handles values that contain shell-special characters (`, !, $, etc.).
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r _l || [[ -n "$_l" ]]; do
      [[ "$_l" =~ ^[[:space:]]*# ]] && continue
      [[ "$_l" =~ ^[[:space:]]*$ ]] && continue
      _k="${_l%%=*}"; _k="${_k//[[:space:]]/}"
      _v="${_l#*=}"; _v="${_v%%#*}"; _v="${_v%"${_v##*[![:space:]]}"}"
      [[ "$_v" =~ ^\"(.*)\"$ ]] && _v="${BASH_REMATCH[1]}"
      [[ -n "$_k" ]] && export "$_k=$_v"
    done < "$ENV_FILE"
  fi

  # Server always runs on port 4000 on the host (compose uses API_PORT=3000 internally)
  export PORT=4000

  # Translate Docker service names → 127.0.0.1.
  # Docker Desktop publishes these ports to the host; all reachable via 127.0.0.1.
  export DATABASE_URL="${DATABASE_URL/dbpool-apps/127.0.0.1}"
  export DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL/@db:/@127.0.0.1:}"
  export REDIS_URL="${REDIS_URL/memorycache/127.0.0.1}"
  export S3_ENDPOINT="${S3_ENDPOINT/objectstorage/127.0.0.1}"

  # Gotenberg port 3000 conflicts with Next.js dev server — clear it.
  # Use GOTENBERG_BASE_URL=http://127.0.0.1:3000 manually if running standalone.
  export GOTENBERG_BASE_URL=""
  # Tika 9998 is unique — translate; no-ops gracefully if render profile not running.
  export TIKA_URL="${TIKA_URL/tika/127.0.0.1}"

  # OTel → Tempo gRPC (4317); no-ops if telemetry profile not running.
  export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT/tracing/127.0.0.1}"
  # Alloy/logshipper HTTP OTLP (4318) not published to host by default.
  export OTLP_ENDPOINT=""

  # Meilisearch (7700); no-ops if search profile not running.
  export MEILISEARCH_URL="${MEILISEARCH_URL/meilisearch/127.0.0.1}"

  # Healthchecks ping port not published to host by default — disable.
  export HEALTHCHECKS_BASE_URL=""

  # Local dev always uses development mode and relaxed TLS (self-signed certs).
  export NODE_ENV=development
  export NODE_TLS_REJECT_UNAUTHORIZED=0

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

echo "Running: docker compose ... up -d --no-deps athyper-api"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps athyper-api

echo ""
echo "API service is UP (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps athyper-api
echo ""
