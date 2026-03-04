#!/usr/bin/env bash
# ============================================================
# athyper Mesh - DOWN (profile-aware) - Linux/macOS
# Location:
#   mesh/scripts/down.sh
# Usage:
#   ./down.sh              -> uses MESH_PROFILE from .env or default=mesh
#   ./down.sh mesh         -> stop only mesh profile
#   ./down.sh telemetry    -> stop only telemetry profile (if defined)
#   ./down.sh apps         -> stop only apps profile (if defined)
#   ./down.sh all          -> bring down everything (no --profile)
#   ./down.sh clean        -> bring down everything + remove volumes
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve base directories
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$MESH_DIR/compose"
ENV_DIR="$MESH_DIR/env"
ENV_FILE="$ENV_DIR/.env"

if [[ ! -d "$COMPOSE_DIR" ]]; then
  echo "ERROR: COMPOSE_DIR not found: $COMPOSE_DIR"
  exit 1
fi

# ----------------------------
# Determine docker compose profile to run
# ----------------------------
RUN_PROFILE="${1:-}"

# ----------------------------
# Read ENVIRONMENT + MESH_PROFILE from .env
# ----------------------------
ENVIRONMENT=""
MESH_PROFILE=""

if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue

    # Trim whitespace and quotes
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')

    case "$key" in
      ENVIRONMENT)  ENVIRONMENT="$value" ;;
      MESH_PROFILE) MESH_PROFILE="$value" ;;
    esac
  done < "$ENV_FILE"
else
  echo "WARNING: .env not found: $ENV_FILE"
  echo "Will attempt to run compose down without env-file."
fi

# If CLI arg not provided, use MESH_PROFILE from env, else default mesh
if [[ -z "$RUN_PROFILE" ]]; then
  RUN_PROFILE="${MESH_PROFILE:-mesh}"
fi

# Special modes
USE_PROFILE=1
REMOVE_VOLUMES=0

case "$RUN_PROFILE" in
  all)
    USE_PROFILE=0
    ;;
  clean)
    USE_PROFILE=0
    REMOVE_VOLUMES=1
    ;;
esac

# ----------------------------
# Pick override compose based on ENVIRONMENT
# ----------------------------
OVERRIDE=""
case "$ENVIRONMENT" in
  local)      OVERRIDE="$COMPOSE_DIR/mesh.override.local.yml" ;;
  staging)    OVERRIDE="$COMPOSE_DIR/mesh.override.staging.yml" ;;
  production) OVERRIDE="$COMPOSE_DIR/mesh.override.production.yml" ;;
  *)          OVERRIDE="$COMPOSE_DIR/mesh.override.yml" ;;
esac

if [[ ! -f "$OVERRIDE" ]]; then
  if [[ -f "$COMPOSE_DIR/mesh.dev.yml" ]]; then
    OVERRIDE="$COMPOSE_DIR/mesh.dev.yml"
  else
    OVERRIDE="$COMPOSE_DIR/mesh.prod.yml"
  fi
fi

echo ""
echo "=========================="
echo "COMPOSE_DIR     = $COMPOSE_DIR"
echo "ENV_FILE        = $ENV_FILE"
echo "ENVIRONMENT     = $ENVIRONMENT"
echo "RUN_PROFILE     = $RUN_PROFILE"
echo "USE_PROFILE     = $USE_PROFILE"
echo "REMOVE_VOLUMES  = $REMOVE_VOLUMES"
echo "OVERRIDE        = $OVERRIDE"
echo "=========================="
echo ""

# ----------------------------
# Docker pre-flight check
# ----------------------------
if ! docker version &>/dev/null; then
  echo "ERROR: Docker does not seem to be running or accessible."
  echo "Start Docker and re-run."
  exit 1
fi

# ----------------------------
# Compose files list
# ----------------------------
COMPOSE_FILES=""

add_file() {
  if [[ -f "$1" ]]; then
    COMPOSE_FILES="$COMPOSE_FILES -f $1"
  else
    echo "WARNING: compose file missing, skipping: $1"
  fi
}

add_file "$COMPOSE_DIR/mesh.base.yml"
add_file "$COMPOSE_DIR/gateway/mesh-gateway.yml"
add_file "$COMPOSE_DIR/iam/mesh-iam.yml"
add_file "$COMPOSE_DIR/objectstorage/mesh-objectstorage.yml"
add_file "$COMPOSE_DIR/memorycache/mesh-memorycache.yml"
add_file "$COMPOSE_DIR/memorycache/mesh-memorycache-exporter.yml"
add_file "$COMPOSE_DIR/telemetry/mesh-metrics.yml"
add_file "$COMPOSE_DIR/telemetry/mesh-tracing.yml"
add_file "$COMPOSE_DIR/telemetry/mesh-logging.yml"
add_file "$COMPOSE_DIR/telemetry/mesh-logshipper.yml"
add_file "$COMPOSE_DIR/telemetry/mesh-telemetry.yml"
add_file "$COMPOSE_DIR/apps/mesh-athyper.yml"
add_file "$OVERRIDE"

# ----------------------------
# Build DOWN args
# ----------------------------
DOWN_ARGS="down --remove-orphans"
if [[ "$REMOVE_VOLUMES" -eq 1 ]]; then
  DOWN_ARGS="$DOWN_ARGS -v"
fi

# ----------------------------
# Execute DOWN (PROFILE-AWARE)
# ----------------------------
if [[ -f "$ENV_FILE" ]]; then
  if [[ "$USE_PROFILE" -eq 1 ]]; then
    echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE --profile $RUN_PROFILE $COMPOSE_FILES $DOWN_ARGS"
    docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$RUN_PROFILE" $COMPOSE_FILES $DOWN_ARGS
  else
    echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE $COMPOSE_FILES $DOWN_ARGS"
    docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" $COMPOSE_FILES $DOWN_ARGS
  fi
else
  # Fallback if env file missing
  if [[ "$USE_PROFILE" -eq 1 ]]; then
    echo "Running: docker compose --project-directory $COMPOSE_DIR --profile $RUN_PROFILE $COMPOSE_FILES $DOWN_ARGS"
    docker compose --project-directory "$COMPOSE_DIR" --profile "$RUN_PROFILE" $COMPOSE_FILES $DOWN_ARGS
  else
    echo "Running: docker compose --project-directory $COMPOSE_DIR $COMPOSE_FILES $DOWN_ARGS"
    docker compose --project-directory "$COMPOSE_DIR" $COMPOSE_FILES $DOWN_ARGS
  fi
fi

echo "✅ Mesh is DOWN (profile=$RUN_PROFILE, env=$ENVIRONMENT)"
echo ""
