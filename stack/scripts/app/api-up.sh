#!/usr/bin/env bash
# ============================================================
# athyper - Backend API UP - Linux/macOS
# Location: stack/scripts/app/api-up.sh
# Usage:
#   ./api-up.sh                       -> API HTTP mode
#   ./api-up.sh worker                -> BullMQ worker mode
#   ./api-up.sh scheduler             -> scheduler mode
#   ./api-up.sh --build               -> rebuild image, then start API
#   ./api-up.sh worker --build        -> rebuild image, then start worker
#   ./api-up.sh --build scheduler     -> rebuild image, then start scheduler
#
# Behaviour (auto-detected from ENVIRONMENT in stack/env/.env):
#   local      -> load stack/env/.env, translate Docker hostnames → 127.0.0.1,
#                 then: pnpm --filter @athyper/runtime-server dev[:<mode>]
#                 (--build is ignored in local mode; tsx handles incremental reloads)
#   staging    -> [--build: docker compose build <api|worker|scheduler>]
#                 docker compose up -d --no-deps <api|worker|scheduler>
#   production -> [--build: docker compose build <api|worker|scheduler>]
#                 docker compose up -d --no-deps <api|worker|scheduler>
#
# Single source of truth: stack/env/.env is the only env file needed.
# server/.env is NOT required — this script injects all vars directly.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

REPO_ROOT="${STACK_DIR}/.."

BUILD_FLAG=0
MODE="api"
MODE_SEEN=0

usage() {
  cat <<EOF
Usage:
  $0 [api|worker|scheduler] [--build]

Defaults to: api
EOF
}

parse_args() {
  local arg
  local arg_lc
  for arg in "$@"; do
    arg_lc="$(printf '%s' "$arg" | tr '[:upper:]' '[:lower:]')"
    case "$arg_lc" in
      --build)
        BUILD_FLAG=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      api|worker|scheduler)
        if [[ "$MODE_SEEN" == "1" ]]; then
          echo "ERROR: only one service target can be supplied." >&2
          usage
          exit 1
        fi
        MODE="$arg_lc"
        MODE_SEEN=1
        ;;
      *)
        echo "ERROR: unsupported target or option: $arg" >&2
        usage
        exit 1
        ;;
    esac
  done
}

parse_args "$@"

init_compose_env || {
  echo "WARNING: .env not found at $ENV_FILE — defaulting to local mode."
}
ENVIRONMENT="${ENVIRONMENT:-local}"

echo ""
echo "=========================="
echo "ENVIRONMENT = $ENVIRONMENT"
echo "SERVICE     = $MODE (@athyper/runtime-server)"
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

  if [[ "$BUILD_FLAG" == "1" ]]; then
    echo "Local mode: --build is ignored; tsx handles incremental reloads."
    echo ""
  fi

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
  export DATABASE_URL="${DATABASE_URL:-}"
  export DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL:-}"
  export REDIS_URL="${REDIS_URL:-}"
  export S3_ENDPOINT="${S3_ENDPOINT:-}"
  export DATABASE_URL="${DATABASE_URL/dbpool-apps/127.0.0.1}"
  export DATABASE_ADMIN_URL="${DATABASE_ADMIN_URL/@db:/@127.0.0.1:}"
  export REDIS_URL="${REDIS_URL/memorycache/127.0.0.1}"
  export REDIS_BULLMQ_URL="${REDIS_BULLMQ_URL:-}"
  export REDIS_BULLMQ_URL="${REDIS_BULLMQ_URL/memorycache-jobs/127.0.0.1}"
  export REDIS_BULLMQ_URL="${REDIS_BULLMQ_URL/memorycache/127.0.0.1}"
  export S3_ENDPOINT="${S3_ENDPOINT/objectstorage/127.0.0.1}"

  # docrender port 3000 conflicts with Next.js dev server — clear it.
  # Use DOCRENDER_BASE_URL=http://127.0.0.1:3000 manually if running standalone.
  export DOCRENDER_BASE_URL=""
  # docparser 9998 is unique — translate; no-ops gracefully if render profile not running.
  export DOCPARSER_URL="${DOCPARSER_URL:-}"
  export DOCPARSER_URL="${DOCPARSER_URL/docparser/127.0.0.1}"

  # OTel → Tempo gRPC (4317); no-ops if telemetry profile not running.
  export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-}"
  export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT/tracing/127.0.0.1}"
  # Alloy/logshipper HTTP OTLP (4318) not published to host by default.
  export OTLP_ENDPOINT=""

  # searchcore (7700); no-ops if search profile not running.
  export SEARCHCORE_URL="${SEARCHCORE_URL:-}"
  export SEARCHCORE_URL="${SEARCHCORE_URL/searchcore/127.0.0.1}"

  # Cronwatch ping port not published to host by default — disable.
  export CRONWATCH_BASE_URL=""

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

if [[ "$BUILD_FLAG" == "1" ]]; then
  echo "Running: docker compose ... build $MODE"
  docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
    "${COMPOSE_FILE_ARGS[@]}" build "$MODE"
  echo ""
fi

echo "Running: docker compose ... up -d --no-deps $MODE"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps "$MODE"

echo ""
echo "$MODE service is UP (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps "$MODE"
echo ""
