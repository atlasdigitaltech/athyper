#!/usr/bin/env bash
# ============================================================
# athyper Stack - CREATE DATA DIRS - Linux/macOS
# Location:
#   stack/scripts/setup/data-dirs-create.sh
# Usage:
#   ./data-dirs-create.sh
#
# Safe, idempotent. Creates the stack/data/ folder structure
# that Docker volume mounts require. Never deletes anything.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="$STACK_DIR/env"
ENV_FILE="$ENV_DIR/.env"

# ----------------------------
# Derive ATHYPER_DATA from STACK_DIR (portable — works at any clone path).
# ATHYPER_DATA in .env is the docker-compose substitution value and may be a
# relative path (../../data) that is only meaningful from a compose file
# directory. For filesystem operations we always anchor to STACK_DIR/data.
# Override: if ATHYPER_DATA is already set in the environment as an absolute
# path, honour it (allows CI / non-standard layouts).
# ----------------------------
if [[ "${ATHYPER_DATA:-}" == /* ]]; then
  : # keep the absolute path already in the environment
else
  ATHYPER_DATA="$STACK_DIR/data"
fi

echo ""
echo "=========================="
echo "STACK_DIR  = $STACK_DIR"
echo "ATHYPER_DATA = $ATHYPER_DATA"
echo "=========================="
echo ""

# ----------------------------
# Create folder structure (idempotent) — must match every ${ATHYPER_DATA}/*
# bind mount in stack/compose/**/*.yml. Keep this list in sync with
# data-dirs-reset.sh.
# ----------------------------
echo "Creating data directory structure..."
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
echo "Done:"
echo "  $ATHYPER_DATA/db"
echo "  $ATHYPER_DATA/meilisearch"
echo "  $ATHYPER_DATA/memorycache"
echo "  $ATHYPER_DATA/memorycache-jobs"
echo "  $ATHYPER_DATA/metabase"
echo "  $ATHYPER_DATA/objectstorage"
echo "  $ATHYPER_DATA/telemetry/logging"
echo "  $ATHYPER_DATA/telemetry/metrics"
echo "  $ATHYPER_DATA/telemetry/observability"
echo "  $ATHYPER_DATA/telemetry/tracing"
echo "  $ATHYPER_DATA/uptime-kuma"
echo ""
