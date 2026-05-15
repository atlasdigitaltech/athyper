#!/usr/bin/env bash
# =======================================================================
# athyper Stack — DATABASE BACKUP
# Location:
#   stack/scripts/db/backup-all.sh
# Usage:
#   bash stack/scripts/db/backup-all.sh
#   bash stack/scripts/db/backup-all.sh --no-upload     # dump only, skip S3 push
#   bash stack/scripts/db/backup-all.sh --upload-only   # skip dump, (re-)push latest
#
# What it does:
#   1. Dumps every application database with pg_dump (custom format, compressed).
#   2. Writes dumps to BACKUP_STAGING_DIR with a UTC timestamp in the filename.
#   3. Uploads each dump to the offsite backup bucket in MinIO (or an external
#      S3-compatible target when BACKUP_REMOTE_S3_ENDPOINT is set).
#   4. Prunes local staging dumps older than BACKUP_LOCAL_RETAIN_DAYS (default: 7).
#
# Databases backed up:
#   athyper_neon      — app runtime (transaction pool)
#   athyper_mesh      — collaboration (transaction pool)
#   athyper_iam       — Keycloak IAM (session pool)
#   athyper_health    — Healthchecks (transaction pool)
#   athyper_errors    — GlitchTip    (transaction pool)
#   athyper_secrets   — Infisical    (transaction pool)
#   athyper_analytics — Metabase     (session pool)
#
# Environment variables (read from env file or shell):
#   ATHYPER_BACKUP_ROOT          — local staging root (default: /opt/stack/athyper/backups)
#   DB_ADMIN_USER                — Postgres superuser (default: athyperadmin)
#   DB_ADMIN_PASSWORD            — Postgres password
#   DATABASE_ADMIN_URL           — full DSN (overrides individual DB_* vars)
#   BACKUP_S3_BUCKET             — MinIO bucket for backups
#   BACKUP_S3_ACCESS_KEY         — MinIO scoped backup account key
#   BACKUP_S3_SECRET_KEY         — MinIO scoped backup account secret
#   BACKUP_REMOTE_S3_ENDPOINT    — optional offsite S3 endpoint (Wasabi / B2 / remote MinIO)
#   BACKUP_REMOTE_S3_ACCESS_KEY  — offsite access key
#   BACKUP_REMOTE_S3_SECRET_KEY  — offsite secret key
#   BACKUP_REMOTE_S3_BUCKET      — offsite bucket name
#   BACKUP_LOCAL_RETAIN_DAYS     — days to keep local dumps (default: 7)
#   COMPOSE_PROJECT_NAME         — Docker project prefix (default: athyper)
#
# Cron setup (Phase 23 of the infrastructure plan):
#   0 2 * * * athyper cd /opt/products/athyper && \
#     /bin/bash stack/scripts/db/backup-all.sh >> /opt/stack/athyper/logs/backup.log 2>&1
#
# Exit codes:
#   0 — all dumps succeeded (and uploads, if not skipped)
#   1 — one or more failures
# =======================================================================

set -euo pipefail

# Disable MSYS/Git Bash path conversion (Windows dev machines)
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "${SCRIPT_DIR}/../lib/constants.sh"

GREEN="$CLR_GREEN"; YELLOW="$CLR_YELLOW"; RED="$CLR_RED"; CYAN="$CLR_CYAN"; NC="$CLR_NC"

# ----------------------------
# CLI flags
# ----------------------------
DO_DUMP=true
DO_UPLOAD=true

for arg in "$@"; do
  case "$arg" in
    --no-upload)    DO_UPLOAD=false ;;
    --upload-only)  DO_DUMP=false ;;
    *)
      echo -e "${RED}Unknown argument: $arg${NC}" >&2
      echo "Usage: $0 [--no-upload | --upload-only]" >&2
      exit 1
      ;;
  esac
done

# ----------------------------
# Resolve env file
# ----------------------------
ENV_FILE=""
if [[ -f "/opt/stack/athyper/secrets/.env" ]]; then
  ENV_FILE="/opt/stack/athyper/secrets/.env"
elif [[ -f "$STACK_DIR/env/.env" ]]; then
  ENV_FILE="$STACK_DIR/env/.env"
elif [[ -f "$STACK_DIR/env/.env.example" ]]; then
  ENV_FILE="$STACK_DIR/env/.env.example"
fi

_env_val() {
  local key="$1"
  local default="${2:-}"
  if [[ -n "$ENV_FILE" ]]; then
    local v
    v="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")"
    echo "${v:-$default}"
  else
    echo "$default"
  fi
}

# ----------------------------
# Configuration
# ----------------------------
BACKUP_STAGING_DIR="${ATHYPER_BACKUP_ROOT:-$(_env_val ATHYPER_BACKUP_ROOT /opt/stack/athyper/backups)}"
BACKUP_LOCAL_RETAIN_DAYS="${BACKUP_LOCAL_RETAIN_DAYS:-$(_env_val BACKUP_LOCAL_RETAIN_DAYS 7)}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_ADMIN_USER="${DB_ADMIN_USER:-$(_env_val DB_ADMIN_USER athyperadmin)}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-$(_env_val DB_ADMIN_PASSWORD)}"

# Extract from DATABASE_ADMIN_URL if set (strip query string)
_DSN="${DATABASE_ADMIN_URL:-$(_env_val DATABASE_ADMIN_URL)}"
if [[ -n "$_DSN" ]]; then
  # Rewrite docker-internal hostnames to localhost (this script runs on the host)
  _DSN="${_DSN//@db:/@localhost:}"
  _DSN="${_DSN//@dbpool-apps:/@localhost:}"
  _DSN="${_DSN//@dbpool-session:/@localhost:}"
  # Extract user/pass/host/port from DSN
  _DSN_STRIPPED="${_DSN%%\?*}"  # strip query string
  DB_ADMIN_USER="$(echo "$_DSN_STRIPPED" | sed -n 's|.*://\([^:@]*\):.*@.*|\1|p')"
  _PASS_HOST="$(echo "$_DSN_STRIPPED" | sed -n 's|.*://[^:@]*:\([^@]*\)@\(.*\)|\1 \2|p')"
  DB_ADMIN_PASSWORD="$(echo "$_PASS_HOST" | awk '{print $1}')"
  _HOST_PORT="$(echo "$_PASS_HOST" | awk '{print $2}')"
  DB_HOST="$(echo "$_HOST_PORT" | cut -d: -f1 | cut -d/ -f1)"
  DB_PORT="$(echo "$_HOST_PORT" | cut -d: -f2 | cut -d/ -f1)"
fi

BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-$(_env_val BACKUP_S3_BUCKET athyper-backups)}"
BACKUP_S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-$(_env_val BACKUP_S3_ACCESS_KEY)}"
BACKUP_S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-$(_env_val BACKUP_S3_SECRET_KEY)}"

# Offsite remote (optional — push to Wasabi / B2 / remote MinIO in addition to local MinIO)
BACKUP_REMOTE_S3_ENDPOINT="${BACKUP_REMOTE_S3_ENDPOINT:-$(_env_val BACKUP_REMOTE_S3_ENDPOINT)}"
BACKUP_REMOTE_S3_ACCESS_KEY="${BACKUP_REMOTE_S3_ACCESS_KEY:-$(_env_val BACKUP_REMOTE_S3_ACCESS_KEY)}"
BACKUP_REMOTE_S3_SECRET_KEY="${BACKUP_REMOTE_S3_SECRET_KEY:-$(_env_val BACKUP_REMOTE_S3_SECRET_KEY)}"
BACKUP_REMOTE_S3_BUCKET="${BACKUP_REMOTE_S3_BUCKET:-$(_env_val BACKUP_REMOTE_S3_BUCKET)}"

MC_IMAGE="${MC_IMAGE:-minio/mc:RELEASE.2025-08-13T08-35-41Z}"
MC_NETWORK="athyper-edge"
PROJECT="${COMPOSE_PROJECT_NAME:-athyper}"
PG_DUMP_MODE="host"

# ----------------------------
# Timestamp for this run
# ----------------------------
TS="$(date -u '+%Y%m%dT%H%M%SZ')"
RUN_DIR="${BACKUP_STAGING_DIR}/${TS}"

# ----------------------------
# Helpers
# ----------------------------
ERRORS=0
FAILURES=()

pass() { echo -e "${GREEN}  OK    $1${NC}"; }
fail() {
  echo -e "${RED}  FAIL  $1${NC}"
  ERRORS=$((ERRORS + 1))
  FAILURES+=("$1")
}
info() { echo -e "${CYAN}  -->   $1${NC}"; }

# Persistent mc config dir — shared across mc_run calls so the alias is not lost
_MC_CFG=""

mc_run() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    --network "$MC_NETWORK" \
    -v "${_MC_CFG}:/tmp/.mc" \
    -e MC_CONFIG_DIR=/tmp/.mc \
    "$MC_IMAGE" \
    "$@" 2>/dev/null
}

is_local_db_host() {
  [[ "$DB_PORT" == "5432" ]] || return 1

  case "$DB_HOST" in
    localhost|127.0.0.1|db|athyper-db-1|"${PROJECT}-db-1"|"$CONTAINER_DB") return 0 ;;
    *) return 1 ;;
  esac
}

run_pg_dump() {
  local db="$1"
  local dump_file="$2"

  if [[ "$PG_DUMP_MODE" == "docker" ]]; then
    docker exec -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$CONTAINER_DB" \
      pg_dump \
        --host=localhost \
        --port=5432 \
        --username="$DB_ADMIN_USER" \
        --format=custom \
        --compress=9 \
        --no-password \
        "$db" > "$dump_file"
  else
    PGPASSWORD="$DB_ADMIN_PASSWORD" pg_dump \
      --host="$DB_HOST" \
      --port="$DB_PORT" \
      --username="$DB_ADMIN_USER" \
      --format=custom \
      --compress=9 \
      --no-password \
      --file="$dump_file" \
      "$db"
  fi
}

# ----------------------------
# Header
# ----------------------------
echo ""
echo -e "${GREEN}=== athyper Database Backup ===${NC}"
echo "  timestamp  : $TS"
echo "  run dir    : $RUN_DIR"
echo "  db host    : $DB_HOST:$DB_PORT"
echo "  db user    : $DB_ADMIN_USER"
echo "  dump       : $DO_DUMP"
echo "  upload     : $DO_UPLOAD"
echo "  retain days: $BACKUP_LOCAL_RETAIN_DAYS"
echo ""

# ----------------------------
# Pre-flight
# ----------------------------
if [[ -z "$DB_ADMIN_PASSWORD" ]]; then
  echo -e "${RED}ERROR: DB_ADMIN_PASSWORD not set and could not be derived from DATABASE_ADMIN_URL.${NC}" >&2
  echo "Set DATABASE_ADMIN_URL or DB_ADMIN_PASSWORD in the env file." >&2
  exit 1
fi

if command -v pg_dump &>/dev/null; then
  PG_DUMP_MODE="host"
elif command -v docker &>/dev/null && is_local_db_host && docker exec "$CONTAINER_DB" pg_dump --version >/dev/null 2>&1; then
  PG_DUMP_MODE="docker"
  info "pg_dump not found on host; using ${CONTAINER_DB}:pg_dump for local backup"
else
  echo -e "${RED}ERROR: pg_dump not found in PATH.${NC}" >&2
  echo "Install postgresql-client on the host machine." >&2
  echo "For local Docker stacks, ensure Docker is running and ${CONTAINER_DB} has pg_dump available." >&2
  exit 1
fi

# ----------------------------
# Canonical database list (frozen registry — matches init-databases.sh)
# ----------------------------
DATABASES=(
  "athyper_neon"
  "athyper_mesh"
  "athyper_iam"
  "athyper_health"
  "athyper_errors"
  "athyper_secrets"
  "athyper_analytics"
)

# ----------------------------
# [1/3] Dump databases
# ----------------------------
if [[ "$DO_DUMP" == "true" ]]; then
  echo "[1/3] Dumping databases..."
  mkdir -p "$RUN_DIR"

  for db in "${DATABASES[@]}"; do
    DUMP_FILE="${RUN_DIR}/${db}_${TS}.dump"
    info "Dumping $db → $(basename "$DUMP_FILE")"

    if run_pg_dump "$db" "$DUMP_FILE" 2>&1; then
      DUMP_SIZE="$(du -sh "$DUMP_FILE" 2>/dev/null | cut -f1 || echo "?")"
      pass "Dumped $db (${DUMP_SIZE})"
    else
      fail "pg_dump failed for $db"
    fi
  done

  # Checksum manifest for integrity verification
  MANIFEST="${RUN_DIR}/SHA256SUMS"
  if command -v sha256sum &>/dev/null; then
    ( cd "$RUN_DIR" && sha256sum ./*.dump > "$MANIFEST" 2>/dev/null ) && \
      pass "SHA256 manifest written: $MANIFEST"
  fi
else
  echo "[1/3] Dump — skipped (--upload-only)"
  # For --upload-only, find the most recent run dir
  RUN_DIR="$(ls -dt "${BACKUP_STAGING_DIR}"/20* 2>/dev/null | head -1 || echo "")"
  if [[ -z "$RUN_DIR" ]]; then
    echo -e "${RED}ERROR: --upload-only specified but no existing dump directory found.${NC}" >&2
    exit 1
  fi
  info "Using latest dump dir: $RUN_DIR"
fi

# ----------------------------
# [2/3] Upload to MinIO (local objectstorage)
# ----------------------------
if [[ "$DO_UPLOAD" == "true" ]]; then
  echo ""
  echo "[2/3] Uploading to local MinIO bucket ($BACKUP_S3_BUCKET)..."

  if [[ -z "$BACKUP_S3_ACCESS_KEY" || -z "$BACKUP_S3_SECRET_KEY" ]]; then
    fail "BACKUP_S3_ACCESS_KEY or BACKUP_S3_SECRET_KEY not set — skipping local MinIO upload"
  elif ! command -v docker &>/dev/null; then
    fail "Docker not in PATH — cannot run mc for MinIO upload"
  else
    _MC_CFG="$(mktemp -d 2>/dev/null || echo "/tmp/mc-backup-$$")"
    mkdir -p "$_MC_CFG"
    _MC_CFG_MOUNT="$(cygpath -m "$_MC_CFG" 2>/dev/null || echo "$_MC_CFG")"
    _MC_CFG="$_MC_CFG_MOUNT"
    trap 'rm -rf "$_MC_CFG"' EXIT INT TERM

    if mc_run alias set backup-local "http://objectstorage:9000" \
        "$BACKUP_S3_ACCESS_KEY" "$BACKUP_S3_SECRET_KEY" >/dev/null 2>&1; then

      RUN_DIR_MOUNT="$(cygpath -m "$RUN_DIR" 2>/dev/null || echo "$RUN_DIR")"

      for dump_file in "${RUN_DIR}"/*.dump; do
        [[ -f "$dump_file" ]] || continue
        fname="$(basename "$dump_file")"
        dump_mount="$(cygpath -m "$dump_file" 2>/dev/null || echo "$dump_file")"

        if MSYS_NO_PATHCONV=1 docker run --rm \
            --network "$MC_NETWORK" \
            -v "${_MC_CFG}:/tmp/.mc" \
            -v "${dump_mount}:/backup/${fname}:ro" \
            -e MC_CONFIG_DIR=/tmp/.mc \
            "$MC_IMAGE" \
            cp "/backup/${fname}" "backup-local/${BACKUP_S3_BUCKET}/${TS}/${fname}" 2>/dev/null; then
          pass "Uploaded: $fname → ${BACKUP_S3_BUCKET}/${TS}/"
        else
          fail "Upload failed: $fname → ${BACKUP_S3_BUCKET}/${TS}/"
        fi
      done
    else
      fail "mc alias set failed — MinIO may not be reachable from Docker network $MC_NETWORK"
    fi
  fi

  # ----------------------------
  # [2b] Upload to offsite remote (optional)
  # ----------------------------
  if [[ -n "$BACKUP_REMOTE_S3_ENDPOINT" ]]; then
    echo ""
    echo "[2b] Uploading to offsite S3 ($BACKUP_REMOTE_S3_ENDPOINT / $BACKUP_REMOTE_S3_BUCKET)..."

    if [[ -z "$BACKUP_REMOTE_S3_ACCESS_KEY" || -z "$BACKUP_REMOTE_S3_SECRET_KEY" || -z "$BACKUP_REMOTE_S3_BUCKET" ]]; then
      fail "BACKUP_REMOTE_S3_ENDPOINT is set but BACKUP_REMOTE_S3_ACCESS_KEY / _SECRET_KEY / _BUCKET are missing"
    elif ! command -v docker &>/dev/null; then
      fail "Docker not in PATH — cannot run mc for offsite upload"
    else
      if mc_run alias set backup-remote "$BACKUP_REMOTE_S3_ENDPOINT" \
          "$BACKUP_REMOTE_S3_ACCESS_KEY" "$BACKUP_REMOTE_S3_SECRET_KEY" >/dev/null 2>&1; then

        for dump_file in "${RUN_DIR}"/*.dump; do
          [[ -f "$dump_file" ]] || continue
          fname="$(basename "$dump_file")"
          dump_mount="$(cygpath -m "$dump_file" 2>/dev/null || echo "$dump_file")"

          if MSYS_NO_PATHCONV=1 docker run --rm \
              --network "$MC_NETWORK" \
              -v "${_MC_CFG}:/tmp/.mc" \
              -v "${dump_mount}:/backup/${fname}:ro" \
              -e MC_CONFIG_DIR=/tmp/.mc \
              "$MC_IMAGE" \
              cp "/backup/${fname}" "backup-remote/${BACKUP_REMOTE_S3_BUCKET}/${TS}/${fname}" 2>/dev/null; then
            pass "Offsite uploaded: $fname → ${BACKUP_REMOTE_S3_BUCKET}/${TS}/"
          else
            fail "Offsite upload failed: $fname"
          fi
        done
      else
        fail "mc alias set failed for offsite remote: $BACKUP_REMOTE_S3_ENDPOINT"
      fi
    fi
  else
    info "BACKUP_REMOTE_S3_ENDPOINT not set — offsite upload skipped"
    echo "    Set BACKUP_REMOTE_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET to enable offsite push"
  fi
else
  echo "[2/3] Upload — skipped (--no-upload)"
fi

# ----------------------------
# [3/3] Prune old local dumps
# ----------------------------
echo ""
echo "[3/3] Pruning local dumps older than ${BACKUP_LOCAL_RETAIN_DAYS} days..."
if [[ -d "$BACKUP_STAGING_DIR" ]]; then
  find "$BACKUP_STAGING_DIR" -mindepth 1 -maxdepth 1 -type d \
    -mtime "+${BACKUP_LOCAL_RETAIN_DAYS}" -print0 2>/dev/null | \
  while IFS= read -r -d '' old_dir; do
    rm -rf "$old_dir"
    info "Pruned: $old_dir"
  done
  pass "Prune complete"
else
  info "Backup staging dir does not exist — nothing to prune"
fi

# ----------------------------
# Summary
# ----------------------------
echo ""
echo "========================================================"
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}  RESULT: FAILED — $ERRORS error(s)${NC}"
  echo ""
  for msg in "${FAILURES[@]}"; do
    echo -e "${RED}    ✗ $msg${NC}"
  done
  echo "========================================================"
  exit 1
else
  echo -e "${GREEN}  RESULT: PASSED${NC}"
  echo "========================================================"
  exit 0
fi
