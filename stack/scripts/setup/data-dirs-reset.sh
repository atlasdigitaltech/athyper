#!/usr/bin/env bash
# ============================================================
# athyper Stack - RESET DATA DIRS - Linux/macOS
# Location:
#   stack/scripts/setup/data-dirs-reset.sh
# Usage:
#   ./data-dirs-reset.sh
#
# DESTRUCTIVE — deletes all contents under ATHYPER_DATA then
# recreates the folder structure. Requires explicit YES confirmation.
# For a safe first-time create, use: setup/data-dirs-create.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="$STACK_DIR/env"
ENV_FILE="$ENV_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found: $ENV_FILE"
  echo "Run setup/setup-env.sh first."
  exit 1
fi

# ----------------------------
# Read ENVIRONMENT from .env
# ----------------------------
ENVIRONMENT=""

while IFS='=' read -r key value; do
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')
  [[ "$key" == "ENVIRONMENT" ]] && ENVIRONMENT="$value"
done < "$ENV_FILE"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "ERROR: ENVIRONMENT not found in $ENV_FILE"
  exit 1
fi

# ----------------------------
# Derive ATHYPER_DATA from STACK_DIR.
# ATHYPER_DATA in .env is the docker-compose substitution value; it may be a
# relative path (../../data) that is only meaningful from a compose file
# directory, not from STACK_DIR.  Always anchor to STACK_DIR/data so the
# script works regardless of where the repo is cloned.
# Override: if ATHYPER_DATA in the environment is already an absolute path,
# honour it (allows CI / non-standard layouts).
# ----------------------------
if [[ "${ATHYPER_DATA:-}" == /* ]]; then
  : # keep the absolute path already in the environment
else
  ATHYPER_DATA="$STACK_DIR/data"
fi

echo ""
echo "=========================="
echo "ENV_FILE    = $ENV_FILE"
echo "ENVIRONMENT = $ENVIRONMENT"
echo "ATHYPER_DATA   = $ATHYPER_DATA"
echo "=========================="
echo ""
echo "WARNING: This will DELETE all contents under ATHYPER_DATA."
echo ""

read -p "Type YES to confirm: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  echo "Cancelled."
  exit 0
fi

# ----------------------------
# Delete all inside ATHYPER_DATA
# ----------------------------
mkdir -p "$ATHYPER_DATA"
echo "Deleting contents..."
rm -rf "$ATHYPER_DATA"/*

# ----------------------------
# Recreate folder structure — must match every ${ATHYPER_DATA}/* bind mount
# in stack/compose/**/*.yml. Keep this list in sync with data-dirs-create.sh.
# ----------------------------
echo "Recreating folder structure..."
mkdir -p "$ATHYPER_DATA/db"                       # postgres
mkdir -p "$ATHYPER_DATA/meilisearch"              # search profile
mkdir -p "$ATHYPER_DATA/memorycache"              # redis (shared)
mkdir -p "$ATHYPER_DATA/memorycache-jobs"         # redis (bullmq isolation, opt-in)
mkdir -p "$ATHYPER_DATA/metabase"                 # analytics profile (deferred)
mkdir -p "$ATHYPER_DATA/objectstorage"            # minio
mkdir -p "$ATHYPER_DATA/telemetry/logging"        # loki
mkdir -p "$ATHYPER_DATA/telemetry/metrics"        # prometheus
mkdir -p "$ATHYPER_DATA/telemetry/observability"  # grafana
mkdir -p "$ATHYPER_DATA/telemetry/tracing"        # tempo (wal + local backend)
mkdir -p "$ATHYPER_DATA/uptime-kuma"              # monitoring profile

echo ""
echo "Done."
echo ""
