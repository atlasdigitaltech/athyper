#!/usr/bin/env bash
# ============================================================
# athyper Stack - VERIFY OBJECT STORAGE
# Location:
#   stack/scripts/setup/verify-objectstorage.sh
# Usage:
#   ./verify-objectstorage.sh                              (auto-detects .env)
#   ./verify-objectstorage.sh /path/bootstrap.env          (single file)
#   ./verify-objectstorage.sh /path/bootstrap.env /path/secrets.env (two-file merge; secrets win)
#
# Verifies that MinIO is reachable, all required buckets exist,
# and (in non-local envs) scoped service accounts are provisioned.
#
# Run after Step 6 (stack up) and before Step 7 (seed-db).
# Safe to re-run at any time — no state is modified.
#
# Exit codes:
#   0 — all checks pass
#   1 — one or more failures
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve paths and env files (two-file model)
# $1 = bootstrap env (non-secret config); $2 = secrets env (optional, wins on duplicates)
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="$STACK_DIR/env"
ENV_FILE="${1:-$ENV_DIR/.env}"
ENV_FILE_2="${2:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: env file not found: $ENV_FILE"
  echo "Run setup-env.sh first or pass the path explicitly."
  exit 1
fi

if [[ -n "$ENV_FILE_2" && ! -f "$ENV_FILE_2" ]]; then
  echo "FATAL: secrets env file not found: $ENV_FILE_2"
  exit 1
fi

# ----------------------------
# Parse env files into an associative array (bootstrap first; secrets overlay wins)
# ----------------------------
declare -A ENV_MAP

_parse_env_line() {
  local _line="$1"
  local _key _value

  _line="${_line%$'\r'}"
  [[ -z "$_line" ]] && return
  [[ "$_line" =~ ^[[:space:]]*# ]] && return
  [[ "$_line" != *=* ]] && return

  _key="${_line%%=*}"
  _value="${_line#*=}"

  _key="${_key#"${_key%%[![:space:]]*}"}"
  _key="${_key%"${_key##*[![:space:]]}"}"
  [[ -z "$_key" ]] && return

  if [[ "$_value" == \"* ]]; then
    _value="${_value#\"}"
    _value="${_value%\"}"
  elif [[ "$_value" == "'"* ]]; then
    _value="${_value#\'}"
    _value="${_value%\'}"
  else
    _value="${_value%%#*}"
  fi

  _value="${_value#"${_value%%[![:space:]]*}"}"
  _value="${_value%"${_value##*[![:space:]]}"}"
  ENV_MAP["$_key"]="$_value"
}

_parse_env_file() {
  local _file="$1"
  local _line
  while IFS='' read -r _line || [[ -n "$_line" ]]; do
    _parse_env_line "$_line"
  done < <(cat "$_file")
}

_parse_env_file "$ENV_FILE"
[[ -n "$ENV_FILE_2" ]] && _parse_env_file "$ENV_FILE_2"

ENVIRONMENT="${ENV_MAP[ENVIRONMENT]:-local}"

S3_ACCESS_KEY="${ENV_MAP[S3_ACCESS_KEY]:-}"
S3_SECRET_KEY="${ENV_MAP[S3_SECRET_KEY]:-}"
S3_BUCKET="${ENV_MAP[S3_BUCKET]:-athyper-local}"
BACKUP_S3_BUCKET="${ENV_MAP[BACKUP_S3_BUCKET]:-athyper-backups}"
TEMPO_S3_BUCKET="${ENV_MAP[TEMPO_S3_BUCKET]:-athyper-tempo-traces}"
LOKI_S3_BUCKET="${ENV_MAP[LOKI_S3_BUCKET]:-athyper-loki-logs}"

APP_S3_ACCESS_KEY="${ENV_MAP[APP_S3_ACCESS_KEY]:-}"
BACKUP_S3_ACCESS_KEY="${ENV_MAP[BACKUP_S3_ACCESS_KEY]:-}"
TEMPO_S3_ACCESS_KEY="${ENV_MAP[TEMPO_S3_ACCESS_KEY]:-}"
LOKI_S3_ACCESS_KEY="${ENV_MAP[LOKI_S3_ACCESS_KEY]:-}"

# ----------------------------
# MinIO endpoints
# Host endpoint: always 127.0.0.1:9000 (loopback port binding in compose).
# Docker-internal endpoint: objectstorage:9000 — used by mc running inside the
# athyper-edge network for bucket/user verification.
# ----------------------------
HOST_ENDPOINT="http://127.0.0.1:9000"
MC_ENDPOINT="http://objectstorage:9000"
MC_IMAGE="${MC_IMAGE:-${ENV_MAP[MC_IMAGE]:-minio/mc:RELEASE.2025-08-13T08-35-41Z}}"
MC_NETWORK="athyper-edge"

ERRORS=0
FAILURES=()

fail() {
  echo "  FAIL  $1"
  ERRORS=$((ERRORS + 1))
  FAILURES+=("$1")
}

pass() {
  echo "  OK    $1"
}

# ----------------------------
# Persistent mc config directory — shared across all mc_run invocations so
# that an alias set in one call is visible in the next.  Each docker run is
# a fresh container; without a host-mounted dir the writable layer is
# discarded on exit and every alias set is lost.
# ----------------------------
_MC_CFG=$(mktemp -d 2>/dev/null || echo "/tmp/mc-verify-$$")
mkdir -p "$_MC_CFG"
# cygpath -m converts Git Bash /tmp/... paths to C:/... for Docker Desktop on
# Windows; on Linux/macOS cygpath is absent so fall back to the raw path.
_MC_CFG_MOUNT=$(cygpath -m "$_MC_CFG" 2>/dev/null || echo "$_MC_CFG")
trap 'rm -rf "$_MC_CFG"' EXIT INT TERM

# ----------------------------
# Helper: run an mc command inside the Docker network
# Usage: mc_run <mc args...>
# ----------------------------
mc_run() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    -i \
    --network "$MC_NETWORK" \
    -v "${_MC_CFG_MOUNT}:/tmp/.mc" \
    -e MC_CONFIG_DIR=/tmp/.mc \
    "$MC_IMAGE" \
    "$@" 2>/dev/null
}

echo "=============================================="
echo "  athyper object storage verification"
echo "  environment: $ENVIRONMENT"
echo "  bootstrap:   $ENV_FILE"
[[ -n "$ENV_FILE_2" ]] && echo "  secrets:     $ENV_FILE_2"
echo "=============================================="
echo ""

# ----------------------------
# [1/4] MinIO health check
# ----------------------------
echo "[1/4] MinIO health..."
if ! command -v curl &>/dev/null; then
  echo "  WARN  curl not found — skipping HTTP health check"
else
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 --max-time 10 \
    "${HOST_ENDPOINT}/minio/health/live" 2>/dev/null || echo "000")

  if [[ "$HTTP_STATUS" == "200" ]]; then
    pass "MinIO health endpoint returned 200"
  else
    fail "MinIO not reachable at ${HOST_ENDPOINT}/minio/health/live (HTTP $HTTP_STATUS)"
    echo ""
    echo "  Make sure the stack is running:"
    echo "    bash stack/scripts/stack-profile/up.sh core"
    echo ""
    echo "  Check container logs:"
    echo "    bash stack/scripts/stack-profile/logs.sh objectstorage"
    echo ""
    echo "  Note: MinIO binds to 127.0.0.1:9000 on the host."
    echo "  If running this script from inside Docker, adjust HOST_ENDPOINT."
    echo ""
    # Hard stop — no point checking buckets if MinIO is unreachable
    echo "RESULT: FAILED ($ERRORS error(s))"
    exit 1
  fi
fi

# ----------------------------
# [2/4] Bucket existence check
# ----------------------------
echo "[2/4] Buckets..."

if [[ -z "$S3_ACCESS_KEY" || -z "$S3_SECRET_KEY" ]]; then
  fail "S3_ACCESS_KEY or S3_SECRET_KEY not set in env file — cannot verify buckets"
else
  # Set up mc alias inside the container network
  if ! mc_run alias set storage "$MC_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1; then
    fail "mc alias set failed — MinIO may not be reachable from within Docker network athyper-edge"
  else
    REQUIRED_BUCKETS=("$S3_BUCKET" "$BACKUP_S3_BUCKET" "$TEMPO_S3_BUCKET" "$LOKI_S3_BUCKET")
    for bucket in "${REQUIRED_BUCKETS[@]}"; do
      if [[ -z "$bucket" ]]; then
        fail "bucket name is empty — check env vars"
        continue
      fi
      if mc_run ls "storage/${bucket}" >/dev/null 2>&1; then
        pass "bucket exists: ${bucket}"
      else
        fail "bucket missing: ${bucket}"
        echo "        Run the stack to let objectstorage-init create it:"
        echo "          bash stack/scripts/stack-profile/up.sh core"
        echo "        Or create manually:"
        echo "          mc mb storage/${bucket}"
      fi
    done
  fi
fi

# ----------------------------
# [3/4] APP credentials read/write test
# ----------------------------
echo "[3/4] APP credential r/w test (bucket: $S3_BUCKET)..."

if [[ -z "$APP_S3_ACCESS_KEY" || -z "${ENV_MAP[APP_S3_SECRET_KEY]:-}" ]]; then
  echo "  SKIP  APP_S3_ACCESS_KEY not set — skipping r/w test"
else
  APP_S3_SECRET_KEY="${ENV_MAP[APP_S3_SECRET_KEY]:-}"
  TEST_KEY="athyper-verify-test-$(date +%s)"
  TEST_CONTENT="athyper-objectstorage-verify"

  # Use root credentials to set alias; then switch to APP creds for the I/O test
  RW_OK=true

  # PUT via presigned URL is complex with mc — use mc directly with app creds instead
  if ! mc_run alias set apptest "$MC_ENDPOINT" "$APP_S3_ACCESS_KEY" "$APP_S3_SECRET_KEY" >/dev/null 2>&1; then
    fail "mc alias set failed for APP_S3_ACCESS_KEY"
    RW_OK=false
  fi

  if [[ "$RW_OK" == "true" ]]; then
    # Write test object
    if printf '%s' "$TEST_CONTENT" | mc_run pipe "apptest/${S3_BUCKET}/${TEST_KEY}" >/dev/null 2>&1; then
      pass "APP credentials: write OK"

      # Read test object back
      if mc_run cat "apptest/${S3_BUCKET}/${TEST_KEY}" >/dev/null 2>&1; then
        pass "APP credentials: read OK"
      else
        fail "APP credentials: read failed on ${S3_BUCKET}/${TEST_KEY}"
      fi

      # Delete test object
      if mc_run rm "apptest/${S3_BUCKET}/${TEST_KEY}" >/dev/null 2>&1; then
        pass "APP credentials: delete OK (test object cleaned up)"
      else
        echo "  WARN  APP credentials: delete failed — test object left at ${S3_BUCKET}/${TEST_KEY}"
      fi
    else
      fail "APP credentials: write failed on bucket ${S3_BUCKET}"
      echo "        Check APP_S3_ACCESS_KEY policy — should allow s3:PutObject on ${S3_BUCKET}/*"
    fi
  fi
fi

# ----------------------------
# [4/4] Scoped user existence (non-local only)
# ----------------------------
echo "[4/4] Scoped service accounts..."

if [[ "$ENVIRONMENT" == "local" ]]; then
  echo "  SKIP  ENVIRONMENT=local — scoped accounts not provisioned (all services use root creds)"
else
  if [[ -z "$S3_ACCESS_KEY" || -z "$S3_SECRET_KEY" ]]; then
    fail "S3_ACCESS_KEY/S3_SECRET_KEY required to verify user accounts — skipping"
  else
    mc_run alias set storage "$MC_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1 || true

    SCOPED_USERS=(
      "${APP_S3_ACCESS_KEY}:app"
      "${BACKUP_S3_ACCESS_KEY}:backup"
      "${TEMPO_S3_ACCESS_KEY}:tempo"
      "${LOKI_S3_ACCESS_KEY}:loki"
    )

    for entry in "${SCOPED_USERS[@]}"; do
      key="${entry%%:*}"
      label="${entry##*:}"
      if [[ -z "$key" ]]; then
        fail "scoped account key empty for service: $label"
        continue
      fi
      if mc_run admin user info storage "$key" >/dev/null 2>&1; then
        pass "scoped user exists: $label ($key)"
      else
        fail "scoped user missing: $label ($key)"
        echo "        objectstorage-init provisions users automatically on stack start."
        echo "        Check its logs: docker logs \$(docker ps -qf name=objectstorage-init)"
        echo "        Or re-run the sidecar: docker compose up objectstorage-init"
      fi
    done
  fi
fi

# ----------------------------
# Summary
# ----------------------------
echo ""
echo "=============================================="
if [[ $ERRORS -gt 0 ]]; then
  echo "  RESULT: FAILED — $ERRORS error(s)"
  echo ""
  for msg in "${FAILURES[@]}"; do
    echo "    ✗ $msg"
  done
  echo "=============================================="
  exit 1
else
  echo "  RESULT: PASSED — MinIO healthy, all checks OK"
  echo "=============================================="
  exit 0
fi
