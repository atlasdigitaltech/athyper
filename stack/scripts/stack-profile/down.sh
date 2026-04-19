#!/usr/bin/env bash
# ============================================================
# athyper Stack - DOWN - Linux/macOS
# Location:
#   stack/scripts/stack-profile/down.sh
# Usage:
#   ./down.sh              -> bring down ALL services (no --profile)
#   ./down.sh all          -> bring down ALL services (same as no arg)
#   ./down.sh clean        -> bring down ALL services + remove volumes
#   ./down.sh core         -> stop only core-profile services
#   ./down.sh telemetry    -> stop only telemetry-profile services
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve base directories + shared helpers
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/compose.sh"

# ----------------------------
# Determine docker compose profile to run
# STACK_PROFILE = persisted value from .env
# ACTIVE_PROFILE = resolved runtime value (CLI arg > STACK_PROFILE > "core")
# ----------------------------
ACTIVE_PROFILE="${1:-}"

# ----------------------------
# Read ENVIRONMENT + STACK_PROFILE from .env
# ----------------------------
ENV_FOUND=1
init_compose_env || ENV_FOUND=0

if [[ "$ENV_FOUND" -eq 0 ]]; then
  echo "WARNING: .env not found: $ENV_FILE"
  echo "Will attempt to run compose down without env-file."
fi

# Default: no arg = stop everything (all profiles, matching up.sh all).
# Only scope by profile when an explicit profile name is given.
USE_PROFILE=0
REMOVE_VOLUMES=0
ALL_COMPOSE_PROFILES="admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"

if [[ -z "$ACTIVE_PROFILE" || "$ACTIVE_PROFILE" == "all" ]]; then
  ACTIVE_PROFILE="all"
elif [[ "$ACTIVE_PROFILE" == "clean" ]]; then
  REMOVE_VOLUMES=1
else
  USE_PROFILE=1
fi

# ----------------------------
# Pick override compose based on ENVIRONMENT
# ----------------------------
resolve_compose_override

echo ""
echo "=========================="
echo "COMPOSE_DIR     = $COMPOSE_DIR"
echo "ATHYPER_CONFIG  = $ATHYPER_CONFIG"
echo "ATHYPER_DATA    = $ATHYPER_DATA"
echo "ENV_FILE        = $ENV_FILE"
echo "ENVIRONMENT     = $ENVIRONMENT"
echo "ACTIVE_PROFILE  = $ACTIVE_PROFILE"
echo "USE_PROFILE     = $USE_PROFILE"
echo "REMOVE_VOLUMES  = $REMOVE_VOLUMES"
echo "OVERRIDE        = $OVERRIDE"
echo "=========================="
echo ""

# ----------------------------
# Docker pre-flight check
# ----------------------------
docker_preflight

# ----------------------------
# Compose files list (bash array — safe with spaces in paths)
# ----------------------------
build_compose_file_list

# ----------------------------
# Build DOWN args
# ----------------------------
DOWN_ARGS=( down --remove-orphans )
if [[ "$REMOVE_VOLUMES" -eq 1 ]]; then
  DOWN_ARGS+=( -v )
fi

# ----------------------------
# Execute DOWN (PROFILE-AWARE)
# ----------------------------
if [[ -f "$ENV_FILE" ]]; then
  if [[ "$USE_PROFILE" -eq 1 ]]; then
    echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE --profile $ACTIVE_PROFILE ${COMPOSE_FILE_ARGS[*]} ${DOWN_ARGS[*]}"
    docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$ACTIVE_PROFILE" "${COMPOSE_FILE_ARGS[@]}" "${DOWN_ARGS[@]}"
  else
    echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE ${COMPOSE_FILE_ARGS[*]} ${DOWN_ARGS[*]} [all profiles]"
    COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" "${COMPOSE_FILE_ARGS[@]}" "${DOWN_ARGS[@]}"
  fi
else
  # Fallback if env file missing
  if [[ "$USE_PROFILE" -eq 1 ]]; then
    echo "Running: docker compose --project-directory $COMPOSE_DIR --profile $ACTIVE_PROFILE ${COMPOSE_FILE_ARGS[*]} ${DOWN_ARGS[*]}"
    docker compose --project-directory "$COMPOSE_DIR" --profile "$ACTIVE_PROFILE" "${COMPOSE_FILE_ARGS[@]}" "${DOWN_ARGS[@]}"
  else
    echo "Running: docker compose --project-directory $COMPOSE_DIR ${COMPOSE_FILE_ARGS[*]} ${DOWN_ARGS[*]} [all profiles]"
    COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${COMPOSE_FILE_ARGS[@]}" "${DOWN_ARGS[@]}"
  fi
fi

echo "Stack is DOWN (profile=$ACTIVE_PROFILE, env=$ENVIRONMENT)"
echo ""
