#!/usr/bin/env bash
# ============================================================
# athyper - Backend API DOWN - Linux/macOS
# Location: stack/scripts/app/api-down.sh
#
# Usage:
#   ./api-down.sh             -> stop API
#   ./api-down.sh worker      -> stop worker
#   ./api-down.sh scheduler   -> stop scheduler
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints guidance (server runs in your terminal)
#   staging    -> docker compose stop <api|worker|scheduler>
#   production -> docker compose stop <api|worker|scheduler>
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

SERVICE_TARGET="api"
SERVICE_TARGET_SEEN=0

usage() {
  cat <<EOF
Usage:
  $0 [api|worker|scheduler]

Defaults to: api
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
      api|worker|scheduler)
        if [[ "$SERVICE_TARGET_SEEN" == "1" ]]; then
          echo "ERROR: only one service target can be supplied." >&2
          usage
          exit 1
        fi
        SERVICE_TARGET="$arg_lc"
        SERVICE_TARGET_SEEN=1
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
  echo "WARNING: .env not found at $ENV_FILE - defaulting to local mode."
}
ENVIRONMENT="${ENVIRONMENT:-local}"

echo ""
echo "=========================="
echo "ENVIRONMENT = $ENVIRONMENT"
echo "SERVICE     = $SERVICE_TARGET (@athyper/runtime-server)"
echo "=========================="
echo ""

# ----------------------------
# Local: guidance only
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: the $SERVICE_TARGET process runs in your terminal via api-up.sh."
  echo "To stop: press Ctrl+C in that terminal."
  echo ""
  exit 0
fi

# ----------------------------
# Staging / Production: compose stop
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

echo "Running: docker compose ... stop $SERVICE_TARGET"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" stop "$SERVICE_TARGET"

echo ""
echo "$SERVICE_TARGET service stopped (env=$ENVIRONMENT)"
echo ""
