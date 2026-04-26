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
# Priority: ATHYPER_DATA_ROOT (six-var model, set by systemd on servers or
# in .env for local dev) → ATHYPER_DATA (legacy backwards-compat alias, set
# by compose.sh) → STACK_DIR/data fallback.
# ATHYPER_DATA in .env is the docker-compose substitution value and may be a
# relative path that is only meaningful from a compose file directory; always
# anchor to an absolute path here.
# ----------------------------
if [[ "${ATHYPER_DATA_ROOT:-}" == /* ]]; then
  ATHYPER_DATA="$ATHYPER_DATA_ROOT"
elif [[ "${ATHYPER_DATA:-}" == /* ]]; then
  : # keep the absolute path already in the environment
else
  ATHYPER_DATA="$STACK_DIR/data"
fi

# ── Server-path guard ──────────────────────────────────────────────────────────
# When STACK_DIR is under /opt, the fallback ($STACK_DIR/data) lands inside the
# git checkout — wrong location on a server.  Require ATHYPER_DATA_ROOT to be
# exported explicitly before proceeding.  On local dev, STACK_DIR is never
# under /opt, so this check is harmless.
if [[ "$STACK_DIR" == /opt/* ]] && [[ -z "${ATHYPER_DATA_ROOT:-}" ]]; then
  echo ""
  echo "ERROR: Detected server path (STACK_DIR=$STACK_DIR) but ATHYPER_DATA_ROOT is not set."
  echo ""
  echo "  Without it this script falls back to \$STACK_DIR/data, which puts data"
  echo "  directories inside the git checkout — the wrong location on a server."
  echo ""
  echo "  Export the runtime data path first, then re-run as root:"
  echo ""
  echo "    export ATHYPER_DATA_ROOT=/opt/stack/athyper/data"
  echo "    sudo bash $0"
  echo ""
  echo "  See stack/docs/infrastructure-plan.md Phase 10 for the full procedure."
  exit 1
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

# ----------------------------
# Per-service data dir ownership — server only.
# Each data dir is owned by the UID the writing container runs as, NOT by athyper.
# Gate: only execute when running as root on a server path (/opt/...).
# NEVER run chown -R on the entire data tree after containers have started —
# that would break Grafana (472), Prometheus (65534), Loki/Tempo (10001), Redis (999).
# Only chown individual leaf dirs before a service's very first start.
# ----------------------------
if [[ "${ATHYPER_DATA_ROOT:-}" == /opt/* ]] && [[ "$(id -u)" -eq 0 ]]; then
  echo "Setting per-service data dir ownership (server mode)..."

  # Redis (redis:7.4.8-alpine) — UID 999 / GID 1000
  chown 999:1000  "$ATHYPER_DATA/memorycache"
  chown 999:1000  "$ATHYPER_DATA/memorycache-jobs"
  chmod 750       "$ATHYPER_DATA/memorycache"
  chmod 750       "$ATHYPER_DATA/memorycache-jobs"

  # MinIO (minio/minio) — UID 1000 / GID 1001
  chown 1000:1001 "$ATHYPER_DATA/objectstorage"
  chmod 750       "$ATHYPER_DATA/objectstorage"

  # Grafana Loki (grafana/loki) and Tempo (grafana/tempo) — UID 10001 / GID 10001
  chown 10001:10001 "$ATHYPER_DATA/telemetry/logging"
  chown 10001:10001 "$ATHYPER_DATA/telemetry/tracing"
  chmod 750         "$ATHYPER_DATA/telemetry/logging"
  chmod 750         "$ATHYPER_DATA/telemetry/tracing"

  # Prometheus (prom/prometheus) — nobody = UID 65534 / GID 65534
  chown 65534:65534 "$ATHYPER_DATA/telemetry/metrics"
  chmod 750         "$ATHYPER_DATA/telemetry/metrics"

  # Grafana (grafana/grafana) — UID 472 / GID 472
  chown 472:472   "$ATHYPER_DATA/telemetry/observability"
  chmod 750       "$ATHYPER_DATA/telemetry/observability"

  # Meilisearch and Uptime Kuma — UID 1000 / GID 1000
  chown 1000:1000 "$ATHYPER_DATA/meilisearch"
  chown 1000:1000 "$ATHYPER_DATA/uptime-kuma"
  chmod 750       "$ATHYPER_DATA/meilisearch"
  chmod 750       "$ATHYPER_DATA/uptime-kuma"

  # Metabase (analytics profile, deferred) — UID 1000 / GID 1000
  chown 1000:1000 "$ATHYPER_DATA/metabase"
  chmod 750       "$ATHYPER_DATA/metabase"

  echo "Per-service ownership set. Verify with: ls -lan $ATHYPER_DATA"
  echo "Recheck UID matrix before every major image version bump."
fi
