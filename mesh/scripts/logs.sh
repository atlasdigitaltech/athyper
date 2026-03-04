#!/usr/bin/env bash
# ============================================================
# athyper Mesh - LOGS (profile-aware) - Linux/macOS
# Location:
#   mesh/scripts/logs.sh
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
fi

# Default profile
MESH_PROFILE="${MESH_PROFILE:-mesh}"

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
echo "MESH_PROFILE = $MESH_PROFILE"
echo "SERVICE      = $SERVICE"
echo "FOLLOW       = $FOLLOW"
echo "TAIL         = $TAIL"
echo "=========================="
echo ""

if [[ -f "$ENV_FILE" ]]; then
  echo "Running: docker compose --project-directory $COMPOSE_DIR --env-file $ENV_FILE --profile $MESH_PROFILE $COMPOSE_FILES $LOGS_ARGS"
  docker compose --project-directory "$COMPOSE_DIR" --env-file "$ENV_FILE" --profile "$MESH_PROFILE" $COMPOSE_FILES $LOGS_ARGS
else
  echo "Running: docker compose --project-directory $COMPOSE_DIR --profile $MESH_PROFILE $COMPOSE_FILES $LOGS_ARGS"
  docker compose --project-directory "$COMPOSE_DIR" --profile "$MESH_PROFILE" $COMPOSE_FILES $LOGS_ARGS
fi
