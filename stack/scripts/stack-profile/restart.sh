#!/usr/bin/env bash
# ============================================================
# athyper Stack - RESTART - Linux/macOS
# Location:
#   stack/scripts/stack-profile/restart.sh
# Usage:
#   ./restart.sh                  -> restart all running services
#   ./restart.sh gateway          -> restart specific service
#   ./restart.sh gateway keycloak -> restart multiple services
#   ./restart.sh all              -> restart all services (no profile filter)
#   ./restart.sh --timeout 60     -> custom stop timeout in seconds (default 10)
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve base directories + shared helpers
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

# ----------------------------
# Parse arguments
#   --timeout N  sets stop timeout
#   all          restarts everything regardless of profile
#   anything else is a service name
# ----------------------------
TIMEOUT_ARG=""
RESTART_ALL=0
SERVICES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout|-t)
      TIMEOUT_ARG="--timeout $2"
      shift 2
      ;;
    all)
      RESTART_ALL=1
      shift
      ;;
    *)
      SERVICES+=( "$1" )
      shift
      ;;
  esac
done

# ----------------------------
# Read ENVIRONMENT + STACK_PROFILE from .env
# ----------------------------
init_compose_env || {
  echo "WARNING: .env not found: $ENV_FILE"
  echo "Will attempt to run compose restart without env-file."
}

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

echo ""
echo "=========================="
echo "COMPOSE_DIR   = $COMPOSE_DIR"
echo "ATHYPER_CONFIG= $ATHYPER_CONFIG"
echo "ATHYPER_DATA  = $ATHYPER_DATA"
echo "ENV_FILE      = $ENV_FILE"
echo "ENVIRONMENT   = $ENVIRONMENT"
echo "STACK_PROFILE = $STACK_PROFILE"
echo "RESTART_ALL   = $RESTART_ALL"
echo "SERVICES      = ${SERVICES[*]:-<all>}"
echo "OVERRIDE      = $OVERRIDE"
echo "=========================="
echo ""

# ----------------------------
# Build restart args
#   docker compose restart does not take --profile; profile only affects up.
#   We pass the full compose file list so Docker Compose targets the right project.
# ----------------------------
RESTART_ARGS=( restart )
[[ -n "$TIMEOUT_ARG" ]] && RESTART_ARGS+=( $TIMEOUT_ARG )
[[ ${#SERVICES[@]} -gt 0 ]] && RESTART_ARGS+=( "${SERVICES[@]}" )

# ----------------------------
# Execute RESTART (all profiles active so every running service is restarted)
# ----------------------------
if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose --project-directory $COMPOSE_DIR ${ENV_FILE_ARGS[*]} ${COMPOSE_FILE_ARGS[*]} ${RESTART_ARGS[*]} [all profiles]"
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" "${RESTART_ARGS[@]}"
else
  echo "Running: docker compose --project-directory $COMPOSE_DIR ${COMPOSE_FILE_ARGS[*]} ${RESTART_ARGS[*]} [all profiles]"
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${COMPOSE_FILE_ARGS[@]}" "${RESTART_ARGS[@]}"
fi

echo ""
echo "Restart complete (services=${SERVICES[*]:-all}, env=$ENVIRONMENT)"
echo ""

# Show status
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" ps
else
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${COMPOSE_FILE_ARGS[@]}" ps
fi

echo ""
