#!/usr/bin/env bash
# ============================================================
# athyper Stack - LOGS (profile-aware) - Linux/macOS
# Location:
#   stack/scripts/stack-profile/logs.sh
# Usage:
#   ./logs.sh                -> show logs for all running services
#   ./logs.sh gateway        -> show logs for gateway service only
#   ./logs.sh -f             -> follow logs (tail -f style)
#   ./logs.sh gateway -f     -> follow gateway logs
#   ./logs.sh --tail 100     -> show last 100 lines
#   ./logs.sh gateway -f --tail 50
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve base directories + shared helpers
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

# ----------------------------
# Parse arguments
# ----------------------------
SERVICE=""
FOLLOW=""
TAIL=""
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--follow)
      FOLLOW="-f"
      shift
      ;;
    --tail|-n)
      TAIL="--tail $2"
      shift 2
      ;;
    *)
      if [[ -z "$SERVICE" ]]; then
        SERVICE="$1"
      else
        EXTRA_ARGS="$EXTRA_ARGS $1"
      fi
      shift
      ;;
  esac
done

# ----------------------------
# Read ENVIRONMENT + STACK_PROFILE from .env
# ----------------------------
init_compose_env || {
  echo "WARNING: .env not found: $ENV_FILE"
}

# STACK_PROFILE: read from .env, displayed only — actual logs use all profiles
STACK_PROFILE="${STACK_PROFILE:-core}"
ALL_COMPOSE_PROFILES="admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"

# ----------------------------
# Pick override compose based on ENVIRONMENT
# ----------------------------
resolve_compose_override

# ----------------------------
# Docker pre-flight check
# ----------------------------
docker_preflight

# ----------------------------
# Compose files list (bash array — safe with spaces in paths)
# ----------------------------
build_compose_file_list

# ----------------------------
# Build logs command
# ----------------------------
LOGS_ARGS="logs"
[[ -n "$FOLLOW" ]] && LOGS_ARGS="$LOGS_ARGS $FOLLOW"
[[ -n "$TAIL" ]] && LOGS_ARGS="$LOGS_ARGS $TAIL"
[[ -n "$SERVICE" ]] && LOGS_ARGS="$LOGS_ARGS $SERVICE"
[[ -n "$EXTRA_ARGS" ]] && LOGS_ARGS="$LOGS_ARGS $EXTRA_ARGS"

# ----------------------------
# Show logs
# ----------------------------
echo ""
echo "=========================="
echo "ENVIRONMENT  = $ENVIRONMENT"
echo "STACK_PROFILE = $STACK_PROFILE"
echo "SERVICE      = $SERVICE"
echo "FOLLOW       = $FOLLOW"
echo "TAIL         = $TAIL"
echo "=========================="
echo ""

if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose --project-directory $COMPOSE_DIR ${ENV_FILE_ARGS[*]} ${COMPOSE_FILE_ARGS[*]} $LOGS_ARGS [all profiles]"
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" $LOGS_ARGS
else
  echo "Running: docker compose --project-directory $COMPOSE_DIR ${COMPOSE_FILE_ARGS[*]} $LOGS_ARGS [all profiles]"
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${COMPOSE_FILE_ARGS[@]}" $LOGS_ARGS
fi
