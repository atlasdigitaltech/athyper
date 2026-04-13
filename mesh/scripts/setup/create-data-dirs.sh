#!/usr/bin/env bash
# ============================================================
# athyper Mesh - CREATE DATA DIRS - Linux/macOS
# Location:
#   mesh/scripts/setup/create-data-dirs.sh
# Usage:
#   ./create-data-dirs.sh
#
# Safe, idempotent. Creates the mesh/data/ folder structure
# that Docker volume mounts require. Never deletes anything.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="$MESH_DIR/env"
ENV_FILE="$ENV_DIR/.env"

# ----------------------------
# Read MESH_DATA from .env (fallback to mesh/data)
# ----------------------------
MESH_DATA=""

if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')
    [[ "$key" == "MESH_DATA" ]] && MESH_DATA="$value"
  done < "$ENV_FILE"
fi

# Resolve relative path against MESH_DIR; fall back to mesh/data
if [[ -z "$MESH_DATA" ]]; then
  MESH_DATA="$MESH_DIR/data"
elif [[ "$MESH_DATA" != /* ]]; then
  MESH_DATA="$(cd "$MESH_DIR" && cd "$MESH_DATA" 2>/dev/null || echo "$MESH_DIR/data" && pwd)"
fi

echo ""
echo "=========================="
echo "MESH_DIR  = $MESH_DIR"
echo "MESH_DATA = $MESH_DATA"
echo "=========================="
echo ""

# ----------------------------
# Create folder structure (idempotent)
# ----------------------------
echo "Creating data directory structure..."
mkdir -p "$MESH_DATA/memorycache"
mkdir -p "$MESH_DATA/objectstorage"
mkdir -p "$MESH_DATA/telemetry/logging"
mkdir -p "$MESH_DATA/telemetry/metrics"
mkdir -p "$MESH_DATA/telemetry/observability"
mkdir -p "$MESH_DATA/telemetry/tracing"

echo ""
echo "Done:"
echo "  $MESH_DATA/memorycache"
echo "  $MESH_DATA/objectstorage"
echo "  $MESH_DATA/telemetry/logging"
echo "  $MESH_DATA/telemetry/metrics"
echo "  $MESH_DATA/telemetry/observability"
echo "  $MESH_DATA/telemetry/tracing"
echo ""
