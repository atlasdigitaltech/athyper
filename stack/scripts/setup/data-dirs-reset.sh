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

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *=* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  [[ -z "$key" ]] && continue
  if [[ "$key" == "ENVIRONMENT" ]]; then
    ENVIRONMENT="$value"
  fi
done < <(tr -d '\r' < "$ENV_FILE")

if [[ -z "$ENVIRONMENT" ]]; then
  echo "ERROR: ENVIRONMENT not found in $ENV_FILE"
  exit 1
fi

# ----------------------------
# Derive ATHYPER_DATA — same priority chain as data-dirs-create.sh:
# ATHYPER_DATA_ROOT (six-var model) → ATHYPER_DATA (backwards-compat alias)
# → STACK_DIR/data fallback.
# ----------------------------
if [[ "${ATHYPER_DATA_ROOT:-}" == /* ]]; then
  ATHYPER_DATA="$ATHYPER_DATA_ROOT"
elif [[ "${ATHYPER_DATA:-}" == /* ]]; then
  : # keep the absolute path already in the environment
else
  ATHYPER_DATA="$STACK_DIR/data"
fi

if [[ "$STACK_DIR" == /opt/* ]] && [[ -z "${ATHYPER_DATA_ROOT:-}" ]]; then
  echo ""
  echo "ERROR: Detected server path (STACK_DIR=$STACK_DIR) but ATHYPER_DATA_ROOT is not set."
  echo ""
  echo "  Without it this script falls back to \$STACK_DIR/data, which can delete"
  echo "  directories in the git checkout on staging/production servers."
  echo ""
  echo "  Export ATHYPER_DATA_ROOT explicitly and rerun:"
  echo "    export ATHYPER_DATA_ROOT=/opt/stack/athyper/data"
  echo "    sudo bash $0"
  echo ""
  exit 1
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
mkdir -p "$ATHYPER_DATA/searchcore"               # search profile
mkdir -p "$ATHYPER_DATA/memorycache"              # redis (shared)
mkdir -p "$ATHYPER_DATA/memorycache-jobs"         # redis (bullmq isolation, opt-in)
mkdir -p "$ATHYPER_DATA/analyticsboard"           # analytics profile (deferred)
mkdir -p "$ATHYPER_DATA/objectstorage"            # minio
mkdir -p "$ATHYPER_DATA/telemetry/alertmanager"   # alertmanager
mkdir -p "$ATHYPER_DATA/telemetry/logging"        # loki
mkdir -p "$ATHYPER_DATA/telemetry/metrics"        # prometheus
mkdir -p "$ATHYPER_DATA/telemetry/observability"  # grafana
mkdir -p "$ATHYPER_DATA/telemetry/tracing"        # tempo (wal + local backend)
mkdir -p "$ATHYPER_DATA/statuswatch"              # monitoring profile

echo ""
echo "Done."
echo ""
