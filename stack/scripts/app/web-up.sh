#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend UP - Linux/macOS
# Location: stack/scripts/app/web-up.sh
#
# Usage:
#   ./web-up.sh                 -> start Neon
#   ./web-up.sh mesh            -> start Mesh
#   ./web-up.sh admin --build   -> rebuild and start Admin
#   ./web-up.sh all             -> start Neon, Mesh, and Admin
#
# Behaviour (auto-detected from ENVIRONMENT in stack/env/.env):
#   local      -> load stack/env/.env, translate Docker hostnames to 127.0.0.1,
#                 derive app-specific vars, then run Next.js dev
#                 (--build is ignored in local mode; pnpm handles incremental rebuilds)
#   staging    -> [--build: docker compose build <target services>]
#                 docker compose up -d --no-deps <target services>
#   production -> [--build: docker compose build <target services>]
#                 docker compose up -d --no-deps <target services>
#
# Single source of truth: stack/env/.env is the only env file needed.
# apps/*/.env.local is NOT required - this script injects all vars directly.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

REPO_ROOT="${STACK_DIR}/.."
BUILD_FLAG=0
PLANE_TARGET="neon"
PLANE_TARGET_SEEN=0
PLANE_NAMES=()
PLANE_SERVICES=()

usage() {
  cat <<EOF
Usage:
  $0 [neon|mesh|admin|all] [--build]

Defaults to: neon
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
      neon|mesh|admin|all)
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
    admin)
      PLANE_NAMES=(admin)
      PLANE_SERVICES=(admin-web)
      ;;
    all)
      PLANE_NAMES=(neon mesh admin)
      PLANE_SERVICES=(neon-web mesh-web admin-web)
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
  export PLATFORM_KEYCLOAK_CLIENT_ID="${PLATFORM_KEYCLOAK_CLIENT_ID:-athyper-admin}"
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
    admin) echo "Admin" ;;
  esac
}

plane_port() {
  case "$1" in
    neon) echo "${NEON_DEV_PORT:-3101}" ;;
    mesh) echo "${MESH_DEV_PORT:-3102}" ;;
    admin) echo "${ADMIN_DEV_PORT:-3103}" ;;
  esac
}

plane_public_url() {
  case "$1" in
    neon) echo "${PUBLIC_NEON_URL:-https://${APPS_ATHYPER_NEON_HOST:-neon.athyper.local}}" ;;
    mesh) echo "${PUBLIC_MESH_URL:-https://${APPS_ATHYPER_MESH_HOST:-mesh.athyper.local}}" ;;
    admin) echo "${PUBLIC_ADMIN_URL:-https://${APPS_ATHYPER_ADMIN_HOST:-admin.athyper.local}}" ;;
  esac
}

plane_realm() {
  case "$1" in
    neon) echo "${NEON_KEYCLOAK_REALM:-${KEYCLOAK_REALM:-athyper}}" ;;
    mesh) echo "${MESH_KEYCLOAK_REALM:-${KEYCLOAK_REALM:-athyper}}" ;;
    admin) echo "${ADMIN_KEYCLOAK_REALM:-${KEYCLOAK_REALM:-athyper}}" ;;
  esac
}

plane_client_id() {
  case "$1" in
    neon) echo "${NEON_KEYCLOAK_CLIENT_ID:-neon-web}" ;;
    mesh) echo "${MESH_KEYCLOAK_CLIENT_ID:-mesh-web}" ;;
    admin) echo "${ADMIN_KEYCLOAK_CLIENT_ID:-admin-web}" ;;
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

shadow_check() {
  local plane="$1"
  local name="${COMPOSE_PROJECT_NAME:-athyper}-${plane}-web-1"
  if docker ps --format '{{.Names}}' --filter "name=^${name}$" 2>/dev/null | grep -qx "$name"; then
    cat >&2 <<EOF

============================================================
 WARNING: containerized ${plane}-web is running while ENVIRONMENT=local.
          Host source edits will NOT take effect.
          Stop it first:  docker stop $name
          Or run:         stack/scripts/dev-local.sh --stop-only
============================================================

EOF
    read -r -p "Continue anyway for ${plane}? [y/N] " _resp
    case "${_resp,,}" in
      y|yes) ;;
      *) echo "Aborted."; exit 1 ;;
    esac
  fi
}

if [[ "$ENVIRONMENT" == "local" ]]; then
  load_stack_env
  export_common_local_env

  cd "$REPO_ROOT"
  for plane in "${PLANE_NAMES[@]}"; do
    shadow_check "$plane"
  done
  echo "Local mode: starting Next.js dev server(s)"

  if [[ ${#PLANE_NAMES[@]} -eq 1 ]]; then
    start_plane_dev "${PLANE_NAMES[0]}"
    exit 0
  fi

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
echo "Web service(s) are UP (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps "${PLANE_SERVICES[@]}"
echo ""
