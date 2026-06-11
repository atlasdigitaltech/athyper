#!/usr/bin/env bash
# ============================================================
# athyper Stack - UP (profile-aware) - Linux/macOS
# Location:
#   stack/scripts/stack-profile/up.sh
# Usage:
#   ./up.sh                -> uses STACK_PROFILE from .env, else "core"
#   ./up.sh core           -> start only core-profile services
#   ./up.sh telemetry      -> start only telemetry-profile services
#   ./up.sh apps           -> start only apps-profile services
#   ./up.sh all            -> start ALL profiles (no --profile filter)
#
# If stack/env/.env is missing, prompts to choose a template and
# creates it before continuing.
#
# Environment validation (validate-env.sh) runs automatically before
# docker compose up. To bypass: SKIP_ENV_VALIDATION=1 ./up.sh
#
# Available profiles:
#   admin, analytics, apps, core, db, dev, emergency, gateway, iam,
#   memorycache, memorycache-jobs, monitoring, objectstorage, render,
#   search, security-infisical, telemetry
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
  if [[ "$ENV_FILE" != "$ENV_DIR/.env" ]]; then
    # Staging / production: ENV_FILE is the secrets file, not the bootstrap.
    # Auto-creating it would overwrite generated secrets with template values.
    echo "ERROR: Secrets env file not found: $ENV_FILE" >&2
    echo ""
    echo "  ATHYPER_SECRETS_ROOT = ${ATHYPER_SECRETS_ROOT:-<unset>}"
    echo "  Expected secrets at  : $ENV_FILE"
    echo ""
    echo "Generate the secrets file first (run as root on the server):"
    echo "  export ACME_EMAIL=\"ops@yourdomain.com\""
    echo "  sudo bash $STACK_DIR/scripts/setup/write-env-staging.sh"
    echo ""
    exit 1
  fi

  echo "WARNING: .env not found: $ENV_FILE" >&2
  echo ""

  read -rp "Select env template [local | staging | production] (blank=local): " PROFILE
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
    echo "ERROR: Template env file not found: $TEMPLATE_FILE" >&2
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
  # Staging/prod: validate the merged view (bootstrap + secrets) to match what
  # docker compose sees. In local dev, bootstrap IS the secrets file — single arg.
  _VALIDATE_ARGS=("$ENV_FILE")
  if [[ "$ENV_DIR/.env" != "$ENV_FILE" ]] && [[ -f "$ENV_DIR/.env" ]]; then
    _VALIDATE_ARGS=("$ENV_DIR/.env" "$ENV_FILE")
  fi
  if ! bash "$VALIDATE_SCRIPT" "${_VALIDATE_ARGS[@]}"; then
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
  # Always include "core" alongside the requested profile so that core-profile
  # services (memorycache, dbpool-*, virusscan …) remain visible for depends_on
  # validation. COMPOSE_PROFILES is used instead of --profile to guarantee both
  # profiles are active regardless of Docker Compose version merge behaviour.
  EFFECTIVE_PROFILES="core,${ACTIVE_PROFILE}"
  echo "Running: docker compose --project-directory $COMPOSE_DIR ${ENV_FILE_ARGS[*]} ${COMPOSE_FILE_ARGS[*]} up -d --remove-orphans [profiles=$EFFECTIVE_PROFILES]"
  COMPOSE_PROFILES="$EFFECTIVE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" up -d --remove-orphans
else
  echo "Running: docker compose --project-directory $COMPOSE_DIR ${ENV_FILE_ARGS[*]} ${COMPOSE_FILE_ARGS[*]} up -d --remove-orphans [all profiles]"
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" up -d --remove-orphans
fi

echo "Stack is UP (profile=$ACTIVE_PROFILE, env=$ENVIRONMENT)"
echo "NOTE: --scale docrender=N is not forwarded by this script. To run multiple docrender replicas, append it directly: docker compose ... up -d --scale docrender=N"

# Show status
if [[ "$USE_PROFILE" -eq 1 ]]; then
  COMPOSE_PROFILES="$EFFECTIVE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" ps
else
  COMPOSE_PROFILES="$ALL_COMPOSE_PROFILES" docker compose --project-directory "$COMPOSE_DIR" "${ENV_FILE_ARGS[@]}" "${COMPOSE_FILE_ARGS[@]}" ps
fi

echo ""
