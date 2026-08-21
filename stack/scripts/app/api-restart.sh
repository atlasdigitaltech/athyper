#!/usr/bin/env bash
# ============================================================
# athyper - Backend API RESTART - Linux/macOS
# Location: stack/scripts/app/api-restart.sh
#
# Usage:
#   ./api-restart.sh             -> restart API
#   ./api-restart.sh worker      -> restart worker
#   ./api-restart.sh scheduler   -> restart scheduler
#
# Behaviour (auto-detected from ENVIRONMENT in .env):
#   local      -> prints guidance (tsx watch handles hot reload)
#   staging    -> docker compose restart <api|worker|scheduler>
#   production -> docker compose restart <api|worker|scheduler>
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
# Local: guidance only - tsx watch handles hot reload
# ----------------------------
if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "Local mode: tsx watch handles hot reloads automatically."
  echo "For a hard restart: Ctrl+C in the $SERVICE_TARGET dev terminal, then run api-up.sh $SERVICE_TARGET."
  echo ""
  exit 0
fi

# ----------------------------
# Staging / Production: compose restart
# ----------------------------
resolve_compose_override
docker_preflight
build_compose_file_list

echo "Running: docker compose ... restart $SERVICE_TARGET"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" restart "$SERVICE_TARGET"

echo ""
echo "$SERVICE_TARGET service restarted (env=$ENVIRONMENT)"
docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" \
  "${COMPOSE_FILE_ARGS[@]}" ps "$SERVICE_TARGET"
echo ""
