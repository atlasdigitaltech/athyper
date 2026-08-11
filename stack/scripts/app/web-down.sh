#!/usr/bin/env bash
# ============================================================
# athyper - Web Frontend DOWN - Linux/macOS
# Location: stack/scripts/app/web-down.sh
#
# Usage:
#   ./web-down.sh          -> stop Neon
#   ./web-down.sh mesh     -> stop Mesh
#   ./web-down.sh admin    -> stop Admin
#   ./web-down.sh all      -> stop Neon, Mesh, and Admin
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints target-aware guidance
#   staging    -> docker compose stop <target services>
#   production -> docker compose stop <target services>
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

PLANE_TARGET="neon"
PLANE_TARGET_SEEN=0
PLANE_SERVICES=()

usage() {
  cat <<EOF
Usage:
  $0 [neon|mesh|admin|all]

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
        echo "ERROR: --build is only supported by web-up.sh."
        usage
        exit 1
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
  echo "Local mode: Next.js dev servers run in your terminal."
  if [[ "$PLANE_TARGET" == "all" ]]; then
    echo "To stop: press Ctrl+C in each Neon, Mesh, and Admin dev terminal."
  else
    echo "To stop: press Ctrl+C in the terminal running the $PLANE_TARGET dev server."
  fi
  echo ""
  exit 0
fi

resolve_compose_override
docker_preflight
build_compose_file_list

echo "Running: docker compose ... stop ${PLANE_SERVICES[*]}"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" stop "${PLANE_SERVICES[@]}"

echo ""
echo "Web service(s) stopped (env=$ENVIRONMENT)"
echo ""
