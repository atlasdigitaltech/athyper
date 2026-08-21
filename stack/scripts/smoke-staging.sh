#!/usr/bin/env bash
# ============================================================
# athyper Stack — SMOKE TEST
# Location:
#   stack/scripts/smoke-staging.sh
# Usage:
#   bash stack/scripts/smoke-staging.sh                              (auto-detects)
#   bash stack/scripts/smoke-staging.sh /path/bootstrap.env          (single file)
#   bash stack/scripts/smoke-staging.sh /path/bootstrap.env /path/secrets.env (two-file)
#   bash stack/scripts/smoke-staging.sh --insecure                   (skip TLS verify on non-local)
#
# Runs a fast end-to-end health sweep against a running stack:
#   1. Docker container status (infra + runtime planes)
#   2. Postgres direct readiness
#   3. PgBouncer pools (apps :6432, session :6433)
#   4. Redis ping (ACL-aware)
#   5. MinIO HTTP health
#   6. API liveness + readiness endpoints
#   7. Application planes (neon/mesh/studio)
#   8. IAM (Keycloak) OIDC discovery — per-realm
#
# Host variables read from the env file:
#   APPS_ATHYPER_API_HOST   — API hostname, e.g. api-stg.athyper.com
#   APPS_ATHYPER_NEON_HOST  — Neon hostname (falls back to APPS_ATHYPER_WEB_HOST)
#   APPS_ATHYPER_MESH_HOST  — Mesh hostname (skipped if unset on non-local)
#   APPS_ATHYPER_STUDIO_HOST — Studio hostname (skipped if unset on non-local)
#   IAM_HOST                — Keycloak hostname, e.g. iam-stg.athyper.com
#   IAM_DEFAULT_REALM       — fallback realm name (default: athyper)
#   {NEON,MESH,STUDIO}_KEYCLOAK_REALM — per-plane realms (checked when set)
#   COMPOSE_PROJECT_NAME    — Docker project prefix (default: athyper)
#   MEMORYCACHE_USER        — Redis ACL user (default: default)
#   MEMORYCACHE_PASSWORD    — Redis password
#   S3_ENDPOINT             — MinIO endpoint (default: http://127.0.0.1:9000)
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more failures
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ----------------------------
# Argument parsing: env files + flags
# ----------------------------
INSECURE_OPT=0
ENV_FILE=""
ENV_FILE_2=""
for arg in "$@"; do
  case "$arg" in
    --insecure) INSECURE_OPT=1 ;;
    --strict-tls) INSECURE_OPT=0 ;;
    -h|--help)
      sed -n '1,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [[ -z "$ENV_FILE" ]]; then ENV_FILE="$arg"
      elif [[ -z "$ENV_FILE_2" ]]; then ENV_FILE_2="$arg"
      else echo "FATAL: too many positional args: $arg" >&2; exit 1
      fi
      ;;
  esac
done

# ----------------------------
# Resolve env files (two-file model)
# Bootstrap auto-detect: stack/env/.env only (NEVER fall back to .env.example)
# Secrets auto-attach when running on a staging/prod server
# ----------------------------
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f "$STACK_DIR/env/.env" ]]; then
    ENV_FILE="$STACK_DIR/env/.env"
  else
    echo "FATAL: no env file specified and $STACK_DIR/env/.env not found" >&2
    echo "Pass the path explicitly: bash smoke-staging.sh /path/to/.env" >&2
    echo "(.env.example is intentionally NOT auto-sourced — placeholder values would mask real failures.)" >&2
    exit 1
  fi
  if [[ -z "$ENV_FILE_2" && -f "/opt/stack/athyper/secrets/.env" ]]; then
    ENV_FILE_2="/opt/stack/athyper/secrets/.env"
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: env file not found: $ENV_FILE" >&2
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

# Pure-bash trim — no xargs (xargs chokes on quotes/backslashes under set -e)
_trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Strip a comment, but only when:
#  - the value is unquoted AND
#  - the `#` is preceded by whitespace (or starts the value)
# Quoted values keep `#` intact (passwords like 's3cr3t#1' are common).
_strip_comment() {
  local v="$1"
  case "$v" in
    \"*\") printf '%s' "${v#\"}" | sed 's/"$//' ;;          # "..." → ...
    \'*\') printf '%s' "${v#\'}" | sed "s/'$//" ;;          # '...' → ...
    *)     # unquoted: drop ` #...` or leading `#...`
           printf '%s' "$v" | sed -E 's/[[:space:]]+#.*$//; s/^#.*$//'
           ;;
  esac
}

_parse_env_file() {
  local _file="$1"
  local key value
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    key="$(_trim "$key")"
    [[ -z "$key" ]] && continue
    value="$(_trim "$value")"
    value="$(_strip_comment "$value")"
    value="$(_trim "$value")"
    ENV_MAP["$key"]="$value"
  done < <(tr -d '\r' < "$_file")
}

_parse_env_file "$ENV_FILE"
[[ -n "$ENV_FILE_2" ]] && _parse_env_file "$ENV_FILE_2"

PROJECT="${ENV_MAP[COMPOSE_PROJECT_NAME]:-athyper}"
ENVIRONMENT="${ENV_MAP[ENVIRONMENT]:-local}"
API_HOST="${ENV_MAP[APPS_ATHYPER_API_HOST]:-}"
NEON_HOST="${ENV_MAP[APPS_ATHYPER_NEON_HOST]:-${ENV_MAP[APPS_ATHYPER_WEB_HOST]:-}}"
MESH_HOST="${ENV_MAP[APPS_ATHYPER_MESH_HOST]:-}"
STUDIO_HOST="${ENV_MAP[APPS_ATHYPER_STUDIO_HOST]:-}"
IAM_HOST="${ENV_MAP[IAM_HOST]:-}"
IAM_DEFAULT_REALM="${ENV_MAP[IAM_DEFAULT_REALM]:-athyper}"
NEON_REALM="${ENV_MAP[NEON_KEYCLOAK_REALM]:-}"
MESH_REALM="${ENV_MAP[MESH_KEYCLOAK_REALM]:-}"
STUDIO_REALM="${ENV_MAP[STUDIO_KEYCLOAK_REALM]:-}"
S3_ENDPOINT="${ENV_MAP[S3_ENDPOINT]:-http://127.0.0.1:9000}"

# Local envs use http by default; all others use https
if [[ "$ENVIRONMENT" == "local" ]]; then
  SCHEME="http"
else
  SCHEME="https"
fi

# Local fallbacks — only when ENVIRONMENT=local. On staging/prod we'd rather
# SKIP a missing host than silently probe a *.athyper.local that does not exist.
if [[ "$ENVIRONMENT" == "local" ]]; then
  API_HOST="${API_HOST:-api.athyper.local}"
  NEON_HOST="${NEON_HOST:-neon.athyper.local}"
  MESH_HOST="${MESH_HOST:-mesh.athyper.local}"
  STUDIO_HOST="${STUDIO_HOST:-studio.athyper.local}"
  IAM_HOST="${IAM_HOST:-iam.athyper.local}"
fi

# TLS verify: insecure only when --insecure passed OR ENVIRONMENT=local.
# Staging/prod should fail loudly on cert problems unless explicitly overridden.
if [[ "$ENVIRONMENT" == "local" || "$INSECURE_OPT" == "1" ]]; then
  CURL_TLS_OPT="-k"
else
  CURL_TLS_OPT=""
fi

# ----------------------------
# Shared helpers
# ----------------------------
PASSES=0
FAILURES_N=0
SKIPS=0
FAILURES=()

pass() { printf "  OK    %s\n" "$1"; PASSES=$((PASSES + 1)); }
fail() {
  printf "  FAIL  %s\n" "$1"
  FAILURES_N=$((FAILURES_N + 1))
  FAILURES+=("$1")
}
warn() { printf "  WARN  %s\n" "$1"; }
skip() { printf "  SKIP  %s\n" "$1"; SKIPS=$((SKIPS + 1)); }

# Decode curl exit codes into readable causes
_curl_err() {
  case "$1" in
    6)  echo "DNS resolution failed" ;;
    7)  echo "connection refused" ;;
    22) echo "HTTP error" ;;
    28) echo "timeout" ;;
    35) echo "TLS handshake failed" ;;
    51|60) echo "TLS cert verification failed" ;;
    0)  echo "ok" ;;
    *)  echo "curl exit=$1" ;;
  esac
}

http_check() {
  local label="$1"
  local url="$2"
  local expected="${3:-200}"

  if ! command -v curl &>/dev/null; then
    skip "$label (curl not available)"
    return
  fi

  local status curl_rc
  # shellcheck disable=SC2086
  status="$(curl -s $CURL_TLS_OPT -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 --max-time 15 \
    "$url" 2>/dev/null)" || curl_rc=$?
  curl_rc="${curl_rc:-0}"

  if [[ "$curl_rc" != "0" ]]; then
    fail "$label → $(_curl_err "$curl_rc") ($url)"
    return
  fi
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
printf "  scheme      : %s%s\n" "$SCHEME" "$([[ -n "$CURL_TLS_OPT" ]] && echo " (TLS verify OFF)" || echo "")"
printf "  hosts       : api=%s neon=%s mesh=%s studio=%s iam=%s\n" \
  "${API_HOST:-<unset>}" "${NEON_HOST:-<unset>}" \
  "${MESH_HOST:-<unset>}" "${STUDIO_HOST:-<unset>}" "${IAM_HOST:-<unset>}"
printf "============================================================\n\n"

# ----------------------------
# [1/8] Container status
# ----------------------------
# Infra + runtime planes. Runtime containers (api/iam/neon/mesh/studio) are
# checked here so a missing container shows up loudly even before HTTP probes.
EXPECTED_CONTAINERS=(
  "${PROJECT}-db-1"
  "${PROJECT}-dbpool-apps-1"
  "${PROJECT}-dbpool-session-1"
  "${PROJECT}-memorycache-1"
  "${PROJECT}-objectstorage-1"
  "${PROJECT}-gateway-1"
  "${PROJECT}-iam-1"
  "${PROJECT}-api-1"
)
# Add runtime web planes only when their host is set (non-local) or always local.
if [[ "$ENVIRONMENT" == "local" || -n "${ENV_MAP[APPS_ATHYPER_NEON_HOST]:-${ENV_MAP[APPS_ATHYPER_WEB_HOST]:-}}" ]]; then
  EXPECTED_CONTAINERS+=("${PROJECT}-neon-1")
fi
if [[ "$ENVIRONMENT" == "local" || -n "${ENV_MAP[APPS_ATHYPER_MESH_HOST]:-}" ]]; then
  EXPECTED_CONTAINERS+=("${PROJECT}-mesh-1")
fi
if [[ "$ENVIRONMENT" == "local" || -n "${ENV_MAP[APPS_ATHYPER_STUDIO_HOST]:-}" ]]; then
  EXPECTED_CONTAINERS+=("${PROJECT}-studio-1")
fi

echo "[1/8] Docker container status..."
if ! command -v docker &>/dev/null; then
  skip "Docker not in PATH — skipping container checks"
else
  for cname in "${EXPECTED_CONTAINERS[@]}"; do
    state="$(docker inspect --format '{{.State.Status}}' "$cname" 2>/dev/null | tr -d '\r\n' || true)"
    [[ -z "$state" ]] && state="missing"
    if [[ "$state" == "running" ]]; then
      pass "container: $cname"
    else
      fail "container: $cname (state=$state)"
    fi
  done

  all_running="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c "^${PROJECT}-" || true)"
  all_running="${all_running:-0}"
  if (( all_running < ${#EXPECTED_CONTAINERS[@]} )); then
    warn "total containers running under project: $all_running (expected ≥ ${#EXPECTED_CONTAINERS[@]})"
  else
    pass "total containers running under project: $all_running"
  fi
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
# [4/8] Redis ping — ACL-aware
# ----------------------------
echo ""
echo "[4/8] Redis ping..."
if command -v docker &>/dev/null; then
  if docker inspect "${PROJECT}-memorycache-1" &>/dev/null; then
    REDIS_USER="${ENV_MAP[MEMORYCACHE_USER]:-default}"
    REDIS_PASS="${ENV_MAP[MEMORYCACHE_PASSWORD]:-}"
    if [[ -n "$REDIS_PASS" ]]; then
      ping_result="$(docker exec "${PROJECT}-memorycache-1" \
        redis-cli --no-auth-warning --user "$REDIS_USER" -a "$REDIS_PASS" ping 2>/dev/null || echo "")"
    else
      ping_result="$(docker exec "${PROJECT}-memorycache-1" \
        redis-cli --user "$REDIS_USER" ping 2>/dev/null || echo "")"
    fi

    if [[ "$ping_result" == "PONG" ]]; then
      pass "Redis ping → PONG (user=$REDIS_USER)"
    else
      fail "Redis ping failed (user=$REDIS_USER, got: $ping_result)"
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
http_check "MinIO liveness" "${S3_ENDPOINT%/}/minio/health/live"

# ----------------------------
# [6/8] API liveness + readiness
# ----------------------------
echo ""
echo "[6/8] API service endpoints..."
if [[ -n "$API_HOST" ]]; then
  http_check "API /livez"  "${SCHEME}://${API_HOST}/livez"
  http_check "API /readyz" "${SCHEME}://${API_HOST}/readyz"
else
  skip "API host not configured (set APPS_ATHYPER_API_HOST)"
fi

# ----------------------------
# [7/8] Application planes
# ----------------------------
echo ""
echo "[7/8] Application planes..."
if [[ -n "$NEON_HOST" ]]; then
  http_check "Neon /livez" "${SCHEME}://${NEON_HOST}/livez"
else
  skip "Neon host not configured (set APPS_ATHYPER_NEON_HOST or APPS_ATHYPER_WEB_HOST)"
fi
if [[ -n "$MESH_HOST" ]]; then
  http_check "Mesh /livez" "${SCHEME}://${MESH_HOST}/livez"
else
  skip "Mesh host not configured (set APPS_ATHYPER_MESH_HOST)"
fi
if [[ -n "$STUDIO_HOST" ]]; then
  http_check "Studio /livez" "${SCHEME}://${STUDIO_HOST}/livez"
else
  skip "Studio host not configured (set APPS_ATHYPER_STUDIO_HOST)"
fi

# ----------------------------
# [8/8] IAM OIDC discovery — per realm
# ----------------------------
echo ""
echo "[8/8] IAM OIDC discovery..."
if [[ -z "$IAM_HOST" ]]; then
  skip "IAM host not configured (set IAM_HOST)"
else
  # Build a deduplicated realm list. Per-plane realms checked when set;
  # default realm always checked. Most envs collapse to one entry.
  declare -A _SEEN_REALMS=()
  REALMS_TO_CHECK=()
  for r in "$IAM_DEFAULT_REALM" "$NEON_REALM" "$MESH_REALM" "$STUDIO_REALM"; do
    [[ -z "$r" ]] && continue
    [[ -n "${_SEEN_REALMS[$r]:-}" ]] && continue
    _SEEN_REALMS[$r]=1
    REALMS_TO_CHECK+=("$r")
  done
  for realm in "${REALMS_TO_CHECK[@]}"; do
    http_check "IAM realm '$realm' /.well-known/openid-configuration" \
      "${SCHEME}://${IAM_HOST}/realms/${realm}/.well-known/openid-configuration"
  done
fi

# ----------------------------
# Summary
# ----------------------------
echo ""
echo "============================================================"
TOTAL=$((PASSES + FAILURES_N + SKIPS))
if (( FAILURES_N > 0 )); then
  echo "  RESULT: FAILED — $PASSES passed, $FAILURES_N failed, $SKIPS skipped ($TOTAL checks)"
  echo ""
  for msg in "${FAILURES[@]}"; do
    printf "    x %s\n" "$msg"
  done
  echo "============================================================"
  exit 1
else
  if (( SKIPS > 0 )); then
    echo "  RESULT: PASSED with skips — $PASSES passed, 0 failed, $SKIPS skipped ($TOTAL checks)"
  else
    echo "  RESULT: PASSED — $PASSES passed ($TOTAL checks)"
  fi
  echo "============================================================"
  exit 0
fi
