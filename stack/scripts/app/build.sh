#!/usr/bin/env bash
# ============================================================
# athyper - Full Application Build - Linux/macOS
# Location: stack/scripts/app/build.sh
#
# Builds the application service images:
#   - api          (server/Dockerfile.prod in staging)
#   - worker       (server/Dockerfile.prod in staging)
#   - scheduler    (server/Dockerfile.prod in staging)
#   - neon-web     (apps/Dockerfile, APP_NAME=neon)
#   - mesh-web     (apps/Dockerfile, APP_NAME=mesh)
#   - admin-web    (apps/Dockerfile, APP_NAME=admin)
#
# This script ONLY builds images. It does not pull source, deploy
# new containers, or prune anything. To deploy after building, use:
#   stack/scripts/app/api-up.sh
#   stack/scripts/app/web-up.sh
# (or `docker compose up -d --no-deps <service>` directly).
#
# Usage:
#   ./build.sh                     -> build all app services
#   ./build.sh --no-cache          -> rebuild from scratch (slow)
#   ./build.sh --service=api       -> build a single service
#   ./build.sh --service=api,neon  -> comma-separated subset
#                                     (api | worker | scheduler | neon | mesh | admin | web | planes)
#                                     web/planes builds neon-web, mesh-web, and admin-web
#
# Local mode is rejected — there is no compose build pipeline in
# local dev (use planes-up.sh/.bat and api-up.sh).
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

# ----------------------------
# Defaults + flag parsing
# ----------------------------
NO_CACHE=0
SERVICE_FILTER="all"

ALL_SERVICES=( api worker scheduler neon-web mesh-web admin-web )

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

for _arg in "$@"; do
  case "$_arg" in
    --no-cache)        NO_CACHE=1 ;;
    --service=*)       SERVICE_FILTER="${_arg#--service=}" ;;
    -h|--help)         usage 0 ;;
    *) echo "Unknown flag: $_arg" >&2; usage 1 ;;
  esac
done

# Resolve the service list from the filter.
declare -a TARGET_SERVICES=()
add_target_service() {
  local service="$1"
  local existing
  for existing in "${TARGET_SERVICES[@]}"; do
    [[ "$existing" == "$service" ]] && return 0
  done
  TARGET_SERVICES+=( "$service" )
}

if [[ "$SERVICE_FILTER" == "all" ]]; then
  TARGET_SERVICES=( "${ALL_SERVICES[@]}" )
else
  IFS=',' read -ra _parts <<< "$SERVICE_FILTER"
  for _p in "${_parts[@]}"; do
    case "$_p" in
      api)        add_target_service api ;;
      worker)     add_target_service worker ;;
      scheduler)  add_target_service scheduler ;;
      neon|neon-web)
                  add_target_service neon-web ;;
      mesh|mesh-web)
                  add_target_service mesh-web ;;
      admin|admin-web)
                  add_target_service admin-web ;;
      web|planes|all-web)
                  add_target_service neon-web
                  add_target_service mesh-web
                  add_target_service admin-web ;;
      *) echo "Unknown service: $_p (expected api|worker|scheduler|neon|mesh|admin|web|planes)" >&2; exit 1 ;;
    esac
  done
fi
unset -f add_target_service

# ----------------------------
# Environment + compose setup
# ----------------------------
init_compose_env || {
  echo "ERROR: .env not found at $ENV_FILE" >&2
  echo "       This script must run on a configured staging or production server." >&2
  exit 1
}
ENVIRONMENT="${ENVIRONMENT:-local}"

if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "ERROR: build.sh is not for local mode." >&2
  echo "       Use api-up.sh / web-up.sh which run the dev server via pnpm." >&2
  exit 1
fi

resolve_compose_override
docker_preflight
build_compose_file_list

# ----------------------------
# Banner
# ----------------------------
echo ""
echo "=========================="
echo "ENVIRONMENT  = $ENVIRONMENT"
echo "SERVICES     = ${TARGET_SERVICES[*]}"
echo "NO_CACHE     = $NO_CACHE"
echo "OVERRIDE     = $OVERRIDE"
echo "=========================="
echo ""

# ----------------------------
# Build images
# ----------------------------
BUILD_ARGS=( build )
[[ "$NO_CACHE" == "1" ]] && BUILD_ARGS+=( --no-cache )
BUILD_ARGS+=( "${TARGET_SERVICES[@]}" )

echo "Running: docker compose ... ${BUILD_ARGS[*]}"
echo ""

# COMPOSE_PROFILES guarantees the apps profile is active so the targeted
# services resolve. `core` is also enabled so any depends_on links Compose
# inspects (memorycache, dbpool-apps) are visible during validation.
COMPOSE_PROFILES="core,apps,gateway" docker compose \
  --project-directory "$COMPOSE_DIR" \
  "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" \
  "${BUILD_ARGS[@]}"

echo ""
echo "Build complete (env=$ENVIRONMENT, services=${TARGET_SERVICES[*]})"
