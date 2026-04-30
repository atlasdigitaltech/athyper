#!/usr/bin/env bash
# ============================================================
# athyper Stack — SMOKE TEST
# Location:
#   stack/scripts/smoke-staging.sh
# Usage:
#   bash stack/scripts/smoke-staging.sh                              (auto-detects)
#   bash stack/scripts/smoke-staging.sh /path/bootstrap.env          (single file)
#   bash stack/scripts/smoke-staging.sh /path/bootstrap.env /path/secrets.env (two-file)
#
# Runs a fast end-to-end health sweep against a running stack:
#   1. Docker container status (all expected containers Up)
#   2. Postgres direct readiness
#   3. PgBouncer pools (apps :6432, session :6433)
#   4. Redis ping
#   5. MinIO HTTP health
#   6. API liveness + readiness endpoints
#   7. Web liveness endpoint
#   8. IAM (Keycloak) OIDC discovery endpoint
#
# Host variables read from the env file:
#   APPS_ATHYPER_API_HOST   — API hostname, e.g. api-stg.athyper.com
#   APPS_ATHYPER_WEB_HOST   — Web hostname, e.g. neon-stg.athyper.com
#   IAM_HOST                — Keycloak hostname, e.g. iam-stg.athyper.com
#   COMPOSE_PROJECT_NAME    — Docker project prefix (default: athyper)
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more failures
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ----------------------------
# Resolve env files (two-file model)
# $1 = bootstrap env (non-secret config); $2 = secrets env (optional, wins on duplicates)
# Auto-detect: bootstrap = stack/env/.env; secrets = /opt/stack/athyper/secrets/.env (if present)
# ----------------------------
ENV_FILE="${1:-}"
ENV_FILE_2="${2:-}"

if [[ -z "$ENV_FILE" ]]; then
  # Bootstrap file: stack/env/.env → stack/env/.env.example
  if [[ -f "$STACK_DIR/env/.env" ]]; then
    ENV_FILE="$STACK_DIR/env/.env"
  else
    ENV_FILE="$STACK_DIR/env/.env.example"
  fi
  # Auto-attach secrets file when running on a staging/prod server
  if [[ -z "$ENV_FILE_2" && -f "/opt/stack/athyper/secrets/.env" ]]; then
    ENV_FILE_2="/opt/stack/athyper/secrets/.env"
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: env file not found: $ENV_FILE" >&2
  echo "Pass the path explicitly: bash smoke-staging.sh /path/to/.env" >&2
  exit 1
fi

if [[ -n "$ENV_FILE_2" && ! -f "$ENV_FILE_2" ]]; then
  echo "FATAL: secrets env file not found: $ENV_FILE_2" >&2
  exit 1
fi

# ----------------------------
# Parse env files into variables (bootstrap first; secrets overlay wins)
# ----------------------------
declare -A ENV_MAP

_parse_env_file() {
  local _file="$1"
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key="$(echo "$key" | xargs)"
    [[ -z "$key" ]] && continue
    value="$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')"
    ENV_MAP["$key"]="${value:-}"
  done < <(tr -d '\r' < "$_file")
}

_parse_env_file "$ENV_FILE"
[[ -n "$ENV_FILE_2" ]] && _parse_env_file "$ENV_FILE_2"

PROJECT="${ENV_MAP[COMPOSE_PROJECT_NAME]:-athyper}"
API_HOST="${ENV_MAP[APPS_ATHYPER_API_HOST]:-}"
WEB_HOST="${ENV_MAP[APPS_ATHYPER_WEB_HOST]:-}"
IAM_HOST="${ENV_MAP[IAM_HOST]:-}"
ENVIRONMENT="${ENV_MAP[ENVIRONMENT]:-local}"

# Derive HTTPS scheme: local envs use http by default; all others use https
if [[ "$ENVIRONMENT" == "local" ]]; then
  SCHEME="http"
else
  SCHEME="https"
fi

# Fall back to Traefik-local hostnames when host vars are absent (local dev)
API_HOST="${API_HOST:-api.athyper.local}"
WEB_HOST="${WEB_HOST:-neon.athyper.local}"
IAM_HOST="${IAM_HOST:-iam.athyper.local}"

# ----------------------------
# Shared helpers
# ----------------------------
ERRORS=0
FAILURES=()

pass() { printf "  OK    %s\n" "$1"; }
fail() {
  printf "  FAIL  %s\n" "$1"
  ERRORS=$((ERRORS + 1))
  FAILURES+=("$1")
}
warn() { printf "  WARN  %s\n" "$1"; }
skip() { printf "  SKIP  %s\n" "$1"; }

http_check() {
  local label="$1"
  local url="$2"
  local expected="${3:-200}"

  if ! command -v curl &>/dev/null; then
    skip "$label (curl not available)"
    return
  fi

  local status
  status="$(curl -sk -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 --max-time 15 \
    "$url" 2>/dev/null || echo "000")"

  if [[ "$status" == "$expected" ]]; then
    pass "$label → HTTP $status"
  else
    fail "$label → expected HTTP $expected, got $status ($url)"
  fi
}

printf "\n"
printf "============================================================\n"
printf "  athyper Smoke Test\n"
printf "  environment : %s\n" "$ENVIRONMENT"
printf "  project     : %s\n" "$PROJECT"
printf "  bootstrap   : %s\n" "$ENV_FILE"
[[ -n "$ENV_FILE_2" ]] && printf "  secrets     : %s\n" "$ENV_FILE_2"
printf "============================================================\n\n"

# ----------------------------
# [1/8] Container status
# ----------------------------
EXPECTED_CONTAINERS=(
  "${PROJECT}-db-1"
  "${PROJECT}-dbpool-apps-1"
  "${PROJECT}-dbpool-session-1"
  "${PROJECT}-memorycache-1"
  "${PROJECT}-objectstorage-1"
  "${PROJECT}-gateway-1"
)

echo "[1/8] Docker container status..."
if ! command -v docker &>/dev/null; then
  skip "Docker not in PATH — skipping container checks"
else
  for cname in "${EXPECTED_CONTAINERS[@]}"; do
    state="$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null || echo "missing")"
    if [[ "$state" == "running" ]]; then
      pass "container: $cname"
    else
      fail "container: $cname (state=$state)"
    fi
  done

  all_running="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c "^${PROJECT}-" || echo "0")"
  pass "total containers running under project: $all_running"
fi

# ----------------------------
# [2/8] Postgres readiness
# ----------------------------
echo ""
echo "[2/8] Postgres direct readiness..."
if command -v docker &>/dev/null; then
  if docker inspect "${PROJECT}-db-1" &>/dev/null; then
    if docker exec "${PROJECT}-db-1" pg_isready -q 2>/dev/null; then
      pass "Postgres pg_isready"
    else
      fail "Postgres pg_isready returned non-zero"
    fi
  else
    skip "container ${PROJECT}-db-1 not found"
  fi
else
  skip "Docker not in PATH"
fi

# ----------------------------
# [3/8] PgBouncer pools
# ----------------------------
echo ""
echo "[3/8] PgBouncer pools..."
if command -v docker &>/dev/null; then
  # Each entry: "container_name:port:label"
  POOLS=(
    "${PROJECT}-dbpool-apps-1:6432:apps"
    "${PROJECT}-dbpool-session-1:6433:session"
  )
  for entry in "${POOLS[@]}"; do
    pool_container="${entry%%:*}"
    rest="${entry#*:}"
    port="${rest%%:*}"
    pool_label="${rest##*:}"
    if docker inspect "$pool_container" &>/dev/null; then
      if docker exec "$pool_container" pg_isready -h 127.0.0.1 -p "$port" -q 2>/dev/null; then
        pass "PgBouncer $pool_label (:$port)"
      else
        fail "PgBouncer $pool_label (:$port) not ready"
      fi
    else
      skip "container $pool_container not found"
    fi
  done
else
  skip "Docker not in PATH"
fi

# ----------------------------
# [4/8] Redis ping
# ----------------------------
echo ""
echo "[4/8] Redis ping..."
if command -v docker &>/dev/null; then
  if docker inspect "${PROJECT}-memorycache-1" &>/dev/null; then
    REDIS_PASS="${ENV_MAP[MEMORYCACHE_PASSWORD]:-}"
    if [[ -n "$REDIS_PASS" ]]; then
      ping_result="$(docker exec "${PROJECT}-memorycache-1" \
        redis-cli --no-auth-warning -a "$REDIS_PASS" ping 2>/dev/null || echo "")"
    else
      ping_result="$(docker exec "${PROJECT}-memorycache-1" \
        redis-cli ping 2>/dev/null || echo "")"
    fi

    if [[ "$ping_result" == "PONG" ]]; then
      pass "Redis ping → PONG"
    else
      fail "Redis ping failed (got: $ping_result)"
    fi
  else
    skip "container ${PROJECT}-memorycache-1 not found"
  fi
else
  skip "Docker not in PATH"
fi

# ----------------------------
# [5/8] MinIO health
# ----------------------------
echo ""
echo "[5/8] MinIO HTTP health..."
http_check "MinIO liveness" "http://127.0.0.1:9000/minio/health/live"

# ----------------------------
# [6/8] API liveness + readiness
# ----------------------------
echo ""
echo "[6/8] API service endpoints ($SCHEME://$API_HOST)..."
http_check "API /livez"  "${SCHEME}://${API_HOST}/livez"
http_check "API /readyz" "${SCHEME}://${API_HOST}/readyz"

# ----------------------------
# [7/8] Web liveness
# ----------------------------
echo ""
echo "[7/8] Web frontend ($SCHEME://$WEB_HOST)..."
http_check "Web /livez" "${SCHEME}://${WEB_HOST}/livez"

# ----------------------------
# [8/8] IAM OIDC discovery
# ----------------------------
echo ""
echo "[8/8] IAM OIDC discovery ($SCHEME://$IAM_HOST)..."
http_check "IAM /.well-known/openid-configuration" \
  "${SCHEME}://${IAM_HOST}/realms/athyper/.well-known/openid-configuration"

# ----------------------------
# Summary
# ----------------------------
echo ""
echo "============================================================"
if [[ $ERRORS -gt 0 ]]; then
  echo "  RESULT: FAILED — $ERRORS check(s) failed"
  echo ""
  for msg in "${FAILURES[@]}"; do
    printf "    ✗ %s\n" "$msg"
  done
  echo "============================================================"
  exit 1
else
  echo "  RESULT: PASSED — all $((8)) check groups clean"
  echo "============================================================"
  exit 0
fi
