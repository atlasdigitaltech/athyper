#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend RESTART - Linux/macOS
# Location: stack/scripts/app/web-restart.sh
#
# Usage:
#   ./web-restart.sh          -> restart Neon
#   ./web-restart.sh mesh     -> restart Mesh
#   ./web-restart.sh admin    -> restart Admin
#   ./web-restart.sh all --build -> rebuild and recreate all plane services
#   ./web-restart.sh all      -> restart Neon, Mesh, and Admin
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints target-aware guidance
#   staging    -> restart selected services; with --build, build then recreate
#   production -> restart selected services; with --build, build then recreate
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

PLANE_TARGET="neon"
PLANE_TARGET_SEEN=0
BUILD_FLAG=0
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
      -h|--help)
        usage
        exit 0
        ;;
      --build)
        BUILD_FLAG=1
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
    neon) PLANE_SERVICES=(neon-web) ;;
    mesh) PLANE_SERVICES=(mesh-web) ;;
    studio) PLANE_SERVICES=(studio-web) ;;
    all) PLANE_SERVICES=(neon-web mesh-web studio-web) ;;
  esac
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
  if [[ "$BUILD_FLAG" == "1" ]]; then
    echo "Local mode: --build is ignored; Next.js handles incremental rebuilds."
  fi
  echo "Local mode: Next.js HMR handles hot reloads automatically."
  echo "For a hard restart: Ctrl+C in the target dev terminal, then run web-up.sh $PLANE_TARGET."
  echo ""
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

  echo "Running: docker compose ... up -d --no-deps --force-recreate ${PLANE_SERVICES[*]}"
  docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
    "${COMPOSE_FILE_ARGS[@]}" up -d --no-deps --force-recreate "${PLANE_SERVICES[@]}"
else
  echo "Running: docker compose ... restart ${PLANE_SERVICES[*]}"
  docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
    "${COMPOSE_FILE_ARGS[@]}" restart "${PLANE_SERVICES[@]}"
fi

echo ""
echo "Web service(s) restarted (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps "${PLANE_SERVICES[@]}"
echo ""
