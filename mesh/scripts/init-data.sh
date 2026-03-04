#!/usr/bin/env bash
# ============================================================
# athyper Mesh - INIT DATA - Linux/macOS
# Location:
#   mesh/scripts/init-data.sh
# Usage:
#   ./init-data.sh
#
# This script:
#   1. Reads MESH_DATA from .env
#   2. Prompts for confirmation
#   3. Deletes all contents under MESH_DATA
#   4. Recreates the folder structure
# ============================================================

set -euo pipefail

# ----------------------------
# Paths
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MESH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_DIR="$MESH_DIR/env"
ENV_FILE="$ENV_DIR/.env"

# ----------------------------
# Bootstrap .env if missing
# ----------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "WARNING: .env not found: $ENV_FILE"
  echo ""

  read -p "Select profile [local | staging | production] (blank=local): " PROFILE
  PROFILE="${PROFILE:-local}"

  case "$PROFILE" in
    local)      TEMPLATE_FILE="$ENV_DIR/local.env.example" ;;
    staging)    TEMPLATE_FILE="$ENV_DIR/staging.env.example" ;;
    production) TEMPLATE_FILE="$ENV_DIR/production.env.example" ;;
    *)          TEMPLATE_FILE="$ENV_DIR/.env.example" ;;
  esac

  echo ""
  echo "ENV_DIR       = $ENV_DIR"
  echo "PROFILE       = $PROFILE"
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
# Check env file exists
# ----------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE"
  echo "Please ensure it exists under: $ENV_DIR"
  exit 1
fi

# ----------------------------
# Read ENVIRONMENT and MESH_DATA
# ----------------------------
ENVIRONMENT=""
MESH_DATA=""

while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue

  # Trim whitespace and quotes
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')

  case "$key" in
    ENVIRONMENT) ENVIRONMENT="$value" ;;
    MESH_DATA)   MESH_DATA="$value" ;;
  esac
done < "$ENV_FILE"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "ERROR: ENVIRONMENT not found in $ENV_FILE"
  exit 1
fi

if [[ -z "$MESH_DATA" ]]; then
  echo "ERROR: MESH_DATA not found in $ENV_FILE"
  exit 1
fi

echo "=========================="
echo "ENV_FILE    = $ENV_FILE"
echo "ENVIRONMENT = $ENVIRONMENT"
echo "MESH_DATA   = $MESH_DATA"
echo "=========================="

# ----------------------------
# Confirm
# ----------------------------
read -p "Type YES to delete contents under MESH_DATA: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  echo "Cancelled."
  exit 0
fi

# ----------------------------
# Ensure base dir exists
# ----------------------------
mkdir -p "$MESH_DATA"

# ----------------------------
# Delete all inside MESH_DATA
# ----------------------------
echo "Deleting contents..."
rm -rf "$MESH_DATA"/*

# ----------------------------
# Recreate folder structure
# ----------------------------
echo "Creating folder structure..."
mkdir -p "$MESH_DATA/memorycache"
mkdir -p "$MESH_DATA/objectstorage"
mkdir -p "$MESH_DATA/telemetry/logging"
mkdir -p "$MESH_DATA/telemetry/metrics"
mkdir -p "$MESH_DATA/telemetry/observability"
mkdir -p "$MESH_DATA/telemetry/tracing"

echo "Done."
echo ""
