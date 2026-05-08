#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend UP - Linux/macOS
# Location: stack/scripts/app/web-up.sh
#
# Usage:
#   ./web-up.sh           -> start (or restart) using existing image
#   ./web-up.sh --build   -> rebuild image from source, then start
#
# Behaviour (auto-detected from ENVIRONMENT in stack/env/.env):
#   local      -> load stack/env/.env, translate Docker hostnames → 127.0.0.1,
#                 derive web-specific vars, then: pnpm --filter @athyper/web dev
#                 (--build is ignored in local mode; pnpm handles incremental rebuilds)
#   staging    -> [--build: docker compose build athyper-neon-web]
#                 docker compose up -d --no-deps athyper-neon-web
#   production -> [--build: docker compose build athyper-neon-web]
#                 docker compose up -d --no-deps athyper-neon-web
#
# Single source of truth: stack/env/.env is the only env file needed.
# apps/web/.env.local is NOT required — this script injects all vars directly.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

REPO_ROOT="${STACK_DIR}/.."

BUILD_FLAG=0
for _arg in "$@"; do
  [[ "$_arg" == "--build" ]] && BUILD_FLAG=1
done

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
# Local: load stack .env, translate, derive web-specific vars, run pnpm dev
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: starting Next.js dev server"
  echo "  pnpm --filter @athyper/web dev"
  echo ""

  # Load all vars from stack/env/.env. Same raw parser as api-up.sh.
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

  # Redis: translate Docker hostname → 127.0.0.1.
  export REDIS_URL="${REDIS_URL/memorycache/127.0.0.1}"
  # Disable socket idle timeout — Windows Docker keeps idle connections alive
  # between page loads; timeout=0 avoids spurious ECONNRESET reconnects.
  export REDIS_SOCKET_TIMEOUT_MS=0

  # API runs on the host at port 4000 (set by api-up.sh).
  # Mirrors compose: RUNTIME_API_URL: "http://athyper-api:${API_PORT}"
  export RUNTIME_API_URL="http://localhost:4000"

  # Derive Keycloak vars from IAM stack vars.
  # Mirrors compose: KEYCLOAK_BASE_URL: "https://${IAM_HOST}"
  export KEYCLOAK_BASE_URL="https://${IAM_HOST}"
  export KEYCLOAK_REALM="${IAM_DEFAULT_REALM}"
  export KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-neon-web}"

  # The shared stack env uses PUBLIC_BASE_URL for the API. The web BFF must
  # advertise the Neon origin to Keycloak when building OAuth redirect_uri.
  export PUBLIC_BASE_URL="${PUBLIC_WEB_URL:-https://${APPS_ATHYPER_WEB_HOST}}"

  # Allow direct localhost:3000 access in local dev (bypasses host-guard middleware).
  export ALLOW_DIRECT_ACCESS=true

  # Map GlitchTip DSN → SENTRY_DSN (mirrors production.env.example).
  export SENTRY_DSN="${SENTRY_DSN:-${GLITCHTIP_DSN:-}}"

  # Derive NEXT_PUBLIC_ vars from base stack vars (mirrors compose service env block).
  export NEXT_PUBLIC_ENVIRONMENT="${ENVIRONMENT}"
  export NEXT_PUBLIC_SERVICE_VERSION="${SERVICE_VERSION:-}"
  export NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="${SENTRY_TRACES_SAMPLE_RATE:-0}"

  # Feature flags — default off unless overridden in stack/env/.env.
  export NEXT_PUBLIC_GITHUB_LOGIN_ENABLED="${NEXT_PUBLIC_GITHUB_LOGIN_ENABLED:-false}"
  export NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED="${NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED:-false}"

  # Local dev: development mode + relaxed TLS (self-signed certs).
  export NODE_ENV=development
  export NODE_TLS_REJECT_UNAUTHORIZED=0

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

if [[ "$BUILD_FLAG" == "1" ]]; then
  echo "Running: docker compose ... build athyper-neon-web"
  docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
    "${COMPOSE_FILE_ARGS[@]}" build athyper-neon-web
  echo ""
fi

echo "Running: docker compose ... up -d --no-deps athyper-neon-web"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps athyper-neon-web

echo ""
echo "Web service is UP (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps athyper-neon-web
echo ""
