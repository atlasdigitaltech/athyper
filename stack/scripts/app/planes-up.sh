#!/usr/bin/env bash
# ============================================================
# athyper - Plane Apps UP - Linux/macOS
# Location: stack/scripts/app/planes-up.sh
#
# Usage:
#   ./planes-up.sh                 -> start Neon, Mesh, and Studio
#   ./planes-up.sh all             -> start Neon, Mesh, and Studio
#   ./planes-up.sh mesh --build    -> rebuild and start Mesh
#   ./planes-up.sh studio          -> start Studio only
#
# Local:
#   Starts selected app(s) on host ports 3101-3103.
#
# Staging/production:
#   Starts selected containerized plane service(s) through Docker Compose.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

REPO_ROOT="${STACK_DIR}/.."
BUILD_FLAG=0
PLANE_TARGET="all"
PLANE_TARGET_SEEN=0
PLANE_NAMES=()
PLANE_SERVICES=()

usage() {
  cat <<EOF
Usage:
  $0 [neon|mesh|studio|all] [--build]

Defaults to: all
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
      neon|mesh|studio|all)
        if [[ "$PLANE_TARGET_SEEN" == "1" ]]; then
          echo "ERROR: only one target can be supplied."
          usage
          exit 1
        fi
        PLANE_TARGET="$arg_lc"
        PLANE_TARGET_SEEN=1
        ;;
      *)
        echo "ERROR: unsupported target or option: $arg"
        usage
        exit 1
        ;;
    esac
  done
}

resolve_targets() {
  case "$PLANE_TARGET" in
    neon)
      PLANE_NAMES=(neon)
      PLANE_SERVICES=(neon-web)
      ;;
    mesh)
      PLANE_NAMES=(mesh)
      PLANE_SERVICES=(mesh-web)
      ;;
    studio)
      PLANE_NAMES=(studio)
      PLANE_SERVICES=(studio-web)
      ;;
    all)
      PLANE_NAMES=(neon mesh studio)
      PLANE_SERVICES=(neon-web mesh-web studio-web)
      ;;
  esac
}

load_stack_env() {
  [[ -f "$ENV_FILE" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    key="${line%%=*}"
    key="${key//[[:space:]]/}"
    value="${line#*=}"
    value="${value%%#*}"
    value="${value%"${value##*[![:space:]]}"}"
    [[ "$value" =~ ^\"(.*)\"$ ]] && value="${BASH_REMATCH[1]}"
    [[ -n "$key" ]] && export "$key=$value"
  done < "$ENV_FILE"
}

export_common_local_env() {
  local redis_url="${REDIS_URL:-}"
  export REDIS_URL="${redis_url/memorycache/127.0.0.1}"
  export REDIS_SOCKET_TIMEOUT_MS=0
  export RUNTIME_API_URL="http://localhost:4000"
  export KEYCLOAK_BASE_URL="https://${IAM_HOST:-iam.athyper.local}"
  export PLATFORM_KEYCLOAK_REALM="${PLATFORM_KEYCLOAK_REALM:-platform-control}"
  export PLATFORM_KEYCLOAK_CLIENT_ID="${PLATFORM_KEYCLOAK_CLIENT_ID:-athyper-studio}"
  export ALLOW_DIRECT_ACCESS=true
  export SENTRY_DSN="${SENTRY_DSN:-${GLITCHTIP_DSN:-}}"
  export NEXT_PUBLIC_ENVIRONMENT="${ENVIRONMENT}"
  export NEXT_PUBLIC_SERVICE_VERSION="${SERVICE_VERSION:-}"
  export NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="${SENTRY_TRACES_SAMPLE_RATE:-0}"
  export NEXT_PUBLIC_GITHUB_LOGIN_ENABLED="${NEXT_PUBLIC_GITHUB_LOGIN_ENABLED:-false}"
  export NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED="${NEXT_PUBLIC_PLATFORM_CONTROL_ENABLED:-false}"
  export NODE_ENV=development
  export NODE_TLS_REJECT_UNAUTHORIZED=0
}

plane_label() {
  case "$1" in
    neon) echo "Neon" ;;
    mesh) echo "Mesh" ;;
    studio) echo "Studio" ;;
  esac
}

plane_port() {
  case "$1" in
    neon) echo "${NEON_DEV_PORT:-3101}" ;;
    mesh) echo "${MESH_DEV_PORT:-3102}" ;;
    studio) echo "${STUDIO_DEV_PORT:-3103}" ;;
  esac
}

plane_public_url() {
  case "$1" in
    neon) echo "${PUBLIC_NEON_URL:-https://${APPS_ATHYPER_NEON_HOST:-neon.athyper.local}}" ;;
    mesh) echo "${PUBLIC_MESH_URL:-https://${APPS_ATHYPER_MESH_HOST:-mesh.athyper.local}}" ;;
    studio) echo "${PUBLIC_STUDIO_URL:-https://${APPS_ATHYPER_STUDIO_HOST:-studio.athyper.local}}" ;;
  esac
}

plane_realm() {
  case "$1" in
    neon) echo "${NEON_KEYCLOAK_REALM:-${KEYCLOAK_REALM:-athyper}}" ;;
    mesh) echo "${MESH_KEYCLOAK_REALM:-${KEYCLOAK_REALM:-athyper}}" ;;
    studio) echo "${STUDIO_KEYCLOAK_REALM:-${KEYCLOAK_REALM:-athyper}}" ;;
  esac
}

plane_client_id() {
  case "$1" in
    neon) echo "${NEON_KEYCLOAK_CLIENT_ID:-neon-web}" ;;
    mesh) echo "${MESH_KEYCLOAK_CLIENT_ID:-mesh-web}" ;;
    studio) echo "${STUDIO_KEYCLOAK_CLIENT_ID:-studio-web}" ;;
  esac
}

start_plane_dev() {
  local plane="$1"
  local port
  local public_url
  local realm
  local client_id
  local upper

  port="$(plane_port "$plane")"
  public_url="$(plane_public_url "$plane")"
  realm="$(plane_realm "$plane")"
  client_id="$(plane_client_id "$plane")"
  upper="$(printf '%s' "$plane" | tr '[:lower:]' '[:upper:]')"

  echo "  $(plane_label "$plane") : $public_url -> localhost:$port"
  (
    export PUBLIC_BASE_URL="$public_url"
    export PUBLIC_WEB_URL="$public_url"
    export "${upper}_PUBLIC_WEB_URL=$public_url"
    export KEYCLOAK_REALM="$realm"
    export KEYCLOAK_CLIENT_ID="$client_id"
    pnpm --filter "@athyper/${plane}" exec next dev --port "$port"
  )
}

parse_args "$@"
resolve_targets

init_compose_env || {
  echo "WARNING: .env not found at $ENV_FILE - defaulting to local mode."
}
ENVIRONMENT="${ENVIRONMENT:-local}"

echo ""
echo "=========================="
echo "ENVIRONMENT = $ENVIRONMENT"
echo "TARGET      = $PLANE_TARGET"
echo "SERVICES    = ${PLANE_SERVICES[*]}"
echo "=========================="
echo ""

if [[ "$ENVIRONMENT" == "local" ]]; then
  load_stack_env
  export_common_local_env

  cd "$REPO_ROOT"
  echo "Starting local plane app(s):"
  for plane in "${PLANE_NAMES[@]}"; do
    start_plane_dev "$plane" &
  done
  wait
  exit 0
fi

resolve_compose_override
docker_preflight
build_compose_file_list

if [[ "$BUILD_FLAG" == "1" ]]; then
  echo "Running: docker compose ... build ${PLANE_SERVICES[*]}"
  docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
    "${COMPOSE_FILE_ARGS[@]}" build "${PLANE_SERVICES[@]}"
  echo ""
fi

echo "Running: docker compose ... up -d --no-deps ${PLANE_SERVICES[*]}"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps "${PLANE_SERVICES[@]}"

echo ""
echo "Plane service(s) are UP (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps "${PLANE_SERVICES[@]}"
echo ""
