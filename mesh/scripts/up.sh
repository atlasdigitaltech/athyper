#!/usr/bin/env bash
# ============================================================
# athyper Mesh - UP (profile-aware) - Linux/macOS
# Location:
#   mesh/scripts/up.sh
# Usage:
#   ./up.sh                -> uses MESH_PROFILE=mesh (default)
#   ./up.sh mesh           -> explicit profile
#   ./up.sh telemetry      -> start only telemetry profile (if defined)
#   ./up.sh apps           -> start apps profile (if defined)
#   ./up.sh all            -> start without --profile (bring everything)
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
# Bootstrap .env if missing
# ----------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "WARNING: .env not found: $ENV_FILE"
  echo ""

  read -p "Select env template [local | staging | production] (blank=local): " PROFILE
  PROFILE="${PROFILE:-local}"

  case "$PROFILE" in
    local)      TEMPLATE_FILE="$ENV_DIR/local.env.example" ;;
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
  echo "✅ Created: $ENV_FILE"
  echo ""
fi

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
fi

# If CLI arg not provided, use MESH_PROFILE from env, else default mesh
if [[ -z "$RUN_PROFILE" ]]; then
  RUN_PROFILE="${MESH_PROFILE:-mesh}"
fi

# Special: allow "all" to run without --profile
USE_PROFILE=1
if [[ "$RUN_PROFILE" == "all" ]]; then
  USE_PROFILE=0
fi

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
echo "COMPOSE_DIR  = $COMPOSE_DIR"
echo "ENV_FILE     = $ENV_FILE"
echo "ENVIRONMENT  = $ENVIRONMENT"
echo "RUN_PROFILE  = $RUN_PROFILE"
echo "OVERRIDE     = $OVERRIDE"
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
add_file "$COMPOSE_DIR/db/mesh-db.yml"
add_file "$COMPOSE_DIR/db/mesh-dbpool-apps.yml"
add_file "$COMPOSE_DIR/db/mesh-dbpool-auth.yml"
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
# Bring up stack (PROFILE-AWARE)
# ----------------------------
if [[ "$USE_PROFILE" -eq 1 ]]; then
  echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE --profile $RUN_PROFILE $COMPOSE_FILES up -d --remove-orphans"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$RUN_PROFILE" $COMPOSE_FILES up -d --remove-orphans
else
  echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE $COMPOSE_FILES up -d --remove-orphans"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" $COMPOSE_FILES up -d --remove-orphans
fi

echo "✅ Mesh is UP (profile=$RUN_PROFILE, env=$ENVIRONMENT)"

# Show status
if [[ "$USE_PROFILE" -eq 1 ]]; then
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$RUN_PROFILE" $COMPOSE_FILES ps
else
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" $COMPOSE_FILES ps
fi

echo ""
