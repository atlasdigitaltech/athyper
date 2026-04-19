#!/usr/bin/env bash
# ============================================================
# athyper Stack - UP (profile-aware) - Linux/macOS
# Location:
#   stack/scripts/stack-profile/up.sh
# Usage:
#   ./up.sh                -> uses STACK_PROFILE=core (default)
#   ./up.sh core           -> explicit profile
#   ./up.sh telemetry      -> start only telemetry profile (if defined)
#   ./up.sh apps           -> start apps profile (if defined)
#   ./up.sh all            -> start without --profile (bring everything)
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
# Bootstrap .env if missing
# ----------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "WARNING: .env not found: $ENV_FILE"
  echo ""

  read -p "Select env template [local | staging | production] (blank=local): " PROFILE
  PROFILE="${PROFILE:-local}"

  case "$PROFILE" in
    local)
      TEMPLATE_FILE="$ENV_DIR/local.env.example"
      [[ ! -f "$TEMPLATE_FILE" ]] && TEMPLATE_FILE="$ENV_DIR/.env.example"
      ;;
    staging)    TEMPLATE_FILE="$ENV_DIR/staging.env.example" ;;
    production) TEMPLATE_FILE="$ENV_DIR/production.env.example" ;;
    *)          TEMPLATE_FILE="$ENV_DIR/.env.example" ;;
  esac

  echo ""
  echo "ENV_DIR       = $ENV_DIR"
  echo "ENV TEMPLATE  = $PROFILE"
  echo "TEMPLATE_FILE = $TEMPLATE_FILE"
  echo "TARGET_ENV    = $ENV_FILE"
  echo ""

  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    echo "ERROR: Template env file not found: $TEMPLATE_FILE"
    echo "Available env templates in $ENV_DIR:"
    ls -1 "$ENV_DIR"/*.example 2>/dev/null || echo "(none found)"
    exit 1
  fi

  echo "Creating .env from template..."
  cp "$TEMPLATE_FILE" "$ENV_FILE"
  echo "Created: $ENV_FILE"
  echo ""
fi

# ----------------------------
# Read ENVIRONMENT + STACK_PROFILE from .env
# ----------------------------
init_compose_env

# If CLI arg not provided, use STACK_PROFILE from env, else default core
if [[ -z "$ACTIVE_PROFILE" ]]; then
  ACTIVE_PROFILE="${STACK_PROFILE:-core}"
fi

# Special: allow "all" to activate every profile
USE_PROFILE=1
ALL_COMPOSE_PROFILES="admin,analytics,apps,core,db,dev,emergency,gateway,iam,memorycache,memorycache-jobs,monitoring,objectstorage,render,search,security-infisical,telemetry"
if [[ "$ACTIVE_PROFILE" == "all" ]]; then
  USE_PROFILE=0
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
echo "OVERRIDE        = $OVERRIDE"
echo "=========================="
echo ""

# ----------------------------
# Validate environment variables
# ----------------------------
VALIDATE_SCRIPT="$STACK_DIR/scripts/setup/validate-env.sh"
if [[ -f "$VALIDATE_SCRIPT" ]]; then
  if ! bash "$VALIDATE_SCRIPT" "$ENV_FILE"; then
    if [[ "${SKIP_ENV_VALIDATION:-}" != "1" ]]; then
      echo ""
      echo "ERROR: Environment validation failed. Fix the errors above."
      echo "To skip (NOT recommended): SKIP_ENV_VALIDATION=1 ./up.sh"
      exit 1
    fi
    echo "WARNING: SKIP_ENV_VALIDATION=1 — proceeding despite validation errors."
  fi
fi

# ----------------------------
# Docker pre-flight check
# ----------------------------
docker_preflight

# ----------------------------
# Compose files list (bash array — safe with spaces in paths)
# ----------------------------
build_compose_file_list

# ----------------------------
# Bring up stack (PROFILE-AWARE)
# ----------------------------
if [[ "$USE_PROFILE" -eq 1 ]]; then
  echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE --profile $ACTIVE_PROFILE ${COMPOSE_FILE_ARGS[*]} up -d --remove-orphans"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$ACTIVE_PROFILE" "${COMPOSE_FILE_ARGS[@]}" up -d --remove-orphans
else
  echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE ${COMPOSE_FILE_ARGS[*]} up -d --remove-orphans [all profiles]"
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" "${COMPOSE_FILE_ARGS[@]}" up -d --remove-orphans
fi

echo "Stack is UP (profile=$ACTIVE_PROFILE, env=$ENVIRONMENT)"
echo "NOTE: --scale gotenberg=N is not forwarded by this script. To run multiple gotenberg replicas, append it directly: docker compose ... up -d --scale gotenberg=N"

# Show status
if [[ "$USE_PROFILE" -eq 1 ]]; then
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$ACTIVE_PROFILE" "${COMPOSE_FILE_ARGS[@]}" ps
else
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" "${COMPOSE_FILE_ARGS[@]}" ps
fi

echo ""
