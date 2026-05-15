#!/usr/bin/env bash
# ============================================================
# athyper Stack - VALIDATE ENVIRONMENT - Linux/macOS
# Location:
#   stack/scripts/setup/validate-env.sh
# Usage:
#   ./validate-env.sh                                       (auto-detects stack/env/.env)
#   ./validate-env.sh /path/bootstrap.env                   (explicit single env file)
#   ./validate-env.sh /path/bootstrap.env /path/secrets.env (two-file merge; secrets win)
#
# Validates that all required environment variables are set and
# consistent before docker compose up. Called automatically by
# stack/scripts/stack-profile/up.sh. Can also be run standalone.
#
# Exit codes:
#   0 — all checks pass
#   1 — fatal: missing required vars (stack will not start)
#   2 — warnings only (non-blocking, informational)
# ============================================================

set -euo pipefail

# ----------------------------
# Resolve paths
# ----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_DIR="$STACK_DIR/env"
ENV_FILE="${1:-$ENV_DIR/.env}"
ENV_FILE_2="${2:-}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: env file not found: $ENV_FILE"
  echo "Run setup-env.sh first or copy an .env.example template."
  exit 1
fi

# ----------------------------
# Parse .env into an associative array
# ----------------------------
declare -A ENV_MAP

while IFS='=' read -r key value; do
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  key=$(echo "$key" | xargs)
  [[ -z "$key" ]] && continue
  value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')
  ENV_MAP["$key"]="$value"
done < <(tr -d '\r' < "$ENV_FILE")

# Merge second env file if provided (secrets win on duplicates — mirrors docker compose --env-file order)
if [[ -n "$ENV_FILE_2" ]]; then
  if [[ ! -f "$ENV_FILE_2" ]]; then
    echo "FATAL: second env file not found: $ENV_FILE_2"
    exit 1
  fi
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | xargs)
    [[ -z "$key" ]] && continue
    value=$(echo "$value" | sed 's/#.*//' | xargs | tr -d '"')
    ENV_MAP["$key"]="$value"
  done < <(tr -d '\r' < "$ENV_FILE_2")
fi

ENVIRONMENT="${ENV_MAP[ENVIRONMENT]:-}"

# ----------------------------
# Helper: check a var is set and not a placeholder
# ----------------------------
ERRORS=0
WARNINGS=0

require_var() {
  local var="$1"
  local val="${ENV_MAP[$var]:-}"
  if [[ -z "$val" ]]; then
    echo "  FAIL  $var is not set"
    ERRORS=$((ERRORS + 1))
    return
  fi
  # Catch un-substituted placeholders like ${VAR}
  if [[ "$val" =~ ^\$\{.+\}$ ]]; then
    echo "  FAIL  $var = $val (placeholder not resolved — inject from secrets manager)"
    ERRORS=$((ERRORS + 1))
    return
  fi
}

warn_var() {
  local var="$1"
  local msg="$2"
  local val="${ENV_MAP[$var]:-}"
  if [[ -z "$val" ]]; then
    echo "  WARN  $var: $msg"
    WARNINGS=$((WARNINGS + 1))
  fi
}

warn_placeholder() {
  local var="$1"
  local val="${ENV_MAP[$var]:-}"
  if [[ "$val" =~ ^\$\{.+\}$ ]]; then
    echo "  WARN  $var = $val (placeholder not resolved)"
    WARNINGS=$((WARNINGS + 1))
  fi
}

echo ""
echo "=========================================="
echo "  athyper Stack — Environment Validation"
echo "  File: $ENV_FILE"
echo "  Environment: ${ENVIRONMENT:-<not set>}"
echo "=========================================="
echo ""

# ----------------------------
# 1. Core identity
# ----------------------------
echo "[1/6] Core identity..."
require_var ENVIRONMENT
require_var COMPOSE_PROJECT_NAME

# ----------------------------
# 2. Required vars (all environments)
# ----------------------------
echo "[2/6] Required variables..."
require_var DATABASE_URL
require_var REDIS_URL
require_var PUBLIC_BASE_URL
require_var PUBLIC_WEB_URL
require_var APPS_ATHYPER_WEB_HOST
require_var APPS_ATHYPER_API_HOST
require_var APPS_ATHYPER_WEB_UPSTREAM_URL
require_var GATEWAY_HOST
require_var IAM_HOST
require_var ALERTMANAGER_HOST
require_var IAM_ISSUER_URL
require_var ATHYPER_KERNEL_CONFIG_PATH

# ----------------------------
# 3. Non-local only: secrets that MUST be injected
# ----------------------------
if [[ "$ENVIRONMENT" != "local" ]]; then
  echo "[3/6] Non-local secrets (must not be placeholders)..."
  require_var CREDENTIAL_MASTER_KEY
  require_var DB_ADMIN_PASSWORD
  # DB_HOST is substituted into pgbouncer-{apps,auth}.ini at container start.
  # If unset, the compose default ('db') leaks the dev service name into prod.
  require_var DB_HOST
  require_var DB_ADMIN_USER
  require_var DBPOOL_APPS_PASSWORD
  require_var DBPOOL_SESSION_PASSWORD
  require_var IAM_ADMIN_PASSWORD
  require_var IAM_CLIENT_SECRET
  require_var ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET
  require_var NEON_SVC_BFF_CLIENT_SECRET
  require_var MEMORYCACHE_PASSWORD
  require_var REDIS_EXPORTER_PASSWORD
  require_var REDIS_GLITCHTIP_PASSWORD
  require_var REDIS_INFISICAL_PASSWORD
  require_var REDIS_ADMIN_PASSWORD
  require_var S3_ACCESS_KEY
  require_var S3_SECRET_KEY
  require_var RENDERER_INTERNAL_TOKEN
  require_var GATEWAY_DASHBOARD_HTPASSWD
  # Track B3.1 — Infisical bootstrap secrets (required even when the
  # security-infisical profile is inactive, so ops cannot accidentally
  # deploy Infisical with placeholder keys later).
  require_var INFISICAL_ENCRYPTION_KEY
  require_var INFISICAL_AUTH_SECRET
  # Telemetry admin (Grafana) — canonical names, no vendor aliases.
  # Without these, Grafana boots with an empty admin password and ops
  # cannot reach the Loki/Tempo/Prom dashboards mid-incident.
  require_var TELEMETRY_ADMIN_USER
  require_var TELEMETRY_ADMIN_PASSWORD
  require_var ALERTMANAGER_SMTP_SMARTHOST
  require_var ALERTMANAGER_SMTP_FROM
  require_var ALERTMANAGER_SMTP_REQUIRE_TLS
  require_var ALERTMANAGER_PLATFORM_EMAIL
  require_var ALERTMANAGER_CRITICAL_EMAIL
  require_var ALERTMANAGER_FINANCE_EMAIL
  require_var ALERTMANAGER_COMPLIANCE_EMAIL
  require_var ALERTMANAGER_SECURITY_EMAIL
else
  echo "[3/6] Skipping non-local secrets check (ENVIRONMENT=local)"
fi

# ----------------------------
# ACL Render: pre-compute Redis password hashes before container start.
# Reads ATHYPER_CONFIG from .env, renders redis-acl.conf.tpl into the
# config dir so the memorycache container mounts a hash-ready file —
# no sed/sha256sum at container startup, no substitution race window.
# ----------------------------
ATHYPER_CONFIG_VAL="${ENV_MAP[ATHYPER_CONFIG]:-${ENV_MAP[ATHYPER_CONFIG_ROOT]:-}}"
ACL_TPL="$STACK_DIR/config/memorycache/redis-acl.conf.tpl"
if [[ -z "$ATHYPER_CONFIG_VAL" ]]; then
  echo "  FAIL  ATHYPER_CONFIG not set — Redis ACL cannot be rendered (memorycache will refuse to start)"
  ERRORS=$((ERRORS + 1))
elif [[ ! -f "$ACL_TPL" ]]; then
  echo "  FAIL  redis-acl.conf.tpl not found: $ACL_TPL"
  ERRORS=$((ERRORS + 1))
else
  ACL_OUT="$ATHYPER_CONFIG_VAL/memorycache/redis-acl.conf"
  APP_HASH=$(printf '%s' "${ENV_MAP[MEMORYCACHE_PASSWORD]:-}" | sha256sum | awk '{print $1}')
  EXP_HASH=$(printf '%s' "${ENV_MAP[REDIS_EXPORTER_PASSWORD]:-}" | sha256sum | awk '{print $1}')
  GT_HASH=$(printf '%s'  "${ENV_MAP[REDIS_GLITCHTIP_PASSWORD]:-}" | sha256sum | awk '{print $1}')
  INF_HASH=$(printf '%s' "${ENV_MAP[REDIS_INFISICAL_PASSWORD]:-}" | sha256sum | awk '{print $1}')
  ADM_HASH=$(printf '%s' "${ENV_MAP[REDIS_ADMIN_PASSWORD]:-}" | sha256sum | awk '{print $1}')
  mkdir -p "$(dirname "$ACL_OUT")"
  sed -e "s/__APP_HASH__/$APP_HASH/g" \
      -e "s/__EXPORTER_HASH__/$EXP_HASH/g" \
      -e "s/__GLITCHTIP_HASH__/$GT_HASH/g" \
      -e "s/__INFISICAL_HASH__/$INF_HASH/g" \
      -e "s/__ADMIN_HASH__/$ADM_HASH/g" \
      "$ACL_TPL" > "$ACL_OUT"
  # 640: athyper (owner) writes; svc-redis group reads via :ro bind mount.
  # No world-read — file contains SHA-256 password hashes.
  chmod 640 "$ACL_OUT"
  # Verify no tokens remain — catches silent sha256sum failures or missing variables.
  if grep -qE '__(APP|EXPORTER|GLITCHTIP|INFISICAL|ADMIN)_HASH__' "$ACL_OUT"; then
    LEFTOVER=$(grep -oE '__(APP|EXPORTER|GLITCHTIP|INFISICAL|ADMIN)_HASH__' "$ACL_OUT" | sort -u | tr '\n' ' ')
    echo "  FAIL  Redis ACL still contains unrendered tokens after render: $LEFTOVER"
    echo "        Check that sha256sum is available and all Redis password vars are set."
    ERRORS=$((ERRORS + 1))
  else
    echo "  [ACL] Redis ACL rendered → $ACL_OUT"
  fi
fi

# ----------------------------
# 4. Hostname parity: kernel config vs .env
# ----------------------------
echo "[4/6] Kernel config hostname parity..."

KERNEL_CONFIG_PATH="${ENV_MAP[ATHYPER_KERNEL_CONFIG_PATH]:-}"
KERNEL_CFG_ROOT="${ATHYPER_CONFIG_VAL:-$STACK_DIR/config}"
KERNEL_FILE="$KERNEL_CFG_ROOT/$KERNEL_CONFIG_PATH"

if [[ -f "$KERNEL_FILE" ]]; then
  # Extract publicBaseUrl from JSON (simple grep, no jq dependency)
  KC_BASE_URL=$(grep -oP '"publicBaseUrl"\s*:\s*"\K[^"]+' "$KERNEL_FILE" 2>/dev/null || true)
  KC_WEB_URL=$(grep -oP '"publicWebUrl"\s*:\s*"\K[^"]+' "$KERNEL_FILE" 2>/dev/null || true)
  KC_ISSUER_URL=$(grep -oP '"issuerUrl"\s*:\s*"\K[^"]+' "$KERNEL_FILE" 2>/dev/null || true)

  ENV_BASE_URL="${ENV_MAP[PUBLIC_BASE_URL]:-}"
  ENV_WEB_URL="${ENV_MAP[PUBLIC_WEB_URL]:-}"
  ENV_ISSUER_URL="${ENV_MAP[IAM_ISSUER_URL]:-}"

  if [[ -n "$KC_BASE_URL" && -n "$ENV_BASE_URL" && "$KC_BASE_URL" != "$ENV_BASE_URL" ]]; then
    echo "  WARN  publicBaseUrl mismatch: kernel=$KC_BASE_URL vs .env PUBLIC_BASE_URL=$ENV_BASE_URL"
    WARNINGS=$((WARNINGS + 1))
  fi
  if [[ -n "$KC_WEB_URL" && -n "$ENV_WEB_URL" && "$KC_WEB_URL" != "$ENV_WEB_URL" ]]; then
    echo "  WARN  publicWebUrl mismatch: kernel=$KC_WEB_URL vs .env PUBLIC_WEB_URL=$ENV_WEB_URL"
    WARNINGS=$((WARNINGS + 1))
  fi
  if [[ -n "$KC_ISSUER_URL" && -n "$ENV_ISSUER_URL" && "$KC_ISSUER_URL" != "$ENV_ISSUER_URL" ]]; then
    echo "  WARN  issuerUrl mismatch: kernel=$KC_ISSUER_URL vs .env IAM_ISSUER_URL=$ENV_ISSUER_URL"
    WARNINGS=$((WARNINGS + 1))
  fi

  if [[ $WARNINGS -eq 0 ]] || [[ -z "$KC_BASE_URL" ]]; then
    echo "  OK"
  fi
else
  echo "  WARN  Kernel config not found: $KERNEL_FILE"
  WARNINGS=$((WARNINGS + 1))
fi

# ----------------------------
# 5. Security warnings
# ----------------------------
echo "[5/6] Security checks..."

if [[ "$ENVIRONMENT" != "local" ]]; then
  # CREDENTIAL_MASTER_KEY length check
  CMK="${ENV_MAP[CREDENTIAL_MASTER_KEY]:-}"
  if [[ -n "$CMK" && ${#CMK} -lt 32 ]]; then
    echo "  FAIL  CREDENTIAL_MASTER_KEY is too short (${#CMK} chars, need >= 32)"
    ERRORS=$((ERRORS + 1))
  fi

  # CREDENTIAL_MASTER_KEY format — should look like base64
  if [[ -n "$CMK" ]] && ! echo "$CMK" | grep -qP '^[A-Za-z0-9+/=]{32,}$'; then
    echo "  WARN  CREDENTIAL_MASTER_KEY doesn't look like base64 — generate with: openssl rand -base64 48"
    WARNINGS=$((WARNINGS + 1))
  fi

  # NODE_TLS_REJECT_UNAUTHORIZED must be 1 in non-local environments
  NODE_TLS="${ENV_MAP[NODE_TLS_REJECT_UNAUTHORIZED]:-}"
  if [[ "$NODE_TLS" != "1" ]]; then
    echo "  FAIL  NODE_TLS_REJECT_UNAUTHORIZED=$NODE_TLS (must be 1 in $ENVIRONMENT)"
    ERRORS=$((ERRORS + 1))
  fi

  # NODE_ENV must be production in non-local environments
  NODE_ENV_VAL="${ENV_MAP[NODE_ENV]:-}"
  if [[ "$NODE_ENV_VAL" != "production" ]]; then
    echo "  FAIL  NODE_ENV=$NODE_ENV_VAL (must be 'production' in $ENVIRONMENT)"
    ERRORS=$((ERRORS + 1))
  fi

  # AUTH_DEBUG_EXPOSE_TOKENS must not be true in non-local environments
  AUTH_DEBUG="${ENV_MAP[AUTH_DEBUG_EXPOSE_TOKENS]:-}"
  if [[ "$AUTH_DEBUG" == "true" ]]; then
    echo "  FAIL  AUTH_DEBUG_EXPOSE_TOKENS=true in $ENVIRONMENT"
    ERRORS=$((ERRORS + 1))
  fi

  # Detect dev passwords in non-local environments
  for var in DB_ADMIN_PASSWORD MEMORYCACHE_PASSWORD REDIS_EXPORTER_PASSWORD REDIS_GLITCHTIP_PASSWORD REDIS_INFISICAL_PASSWORD REDIS_ADMIN_PASSWORD IAM_ADMIN_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY IAM_CLIENT_SECRET ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET NEON_SVC_BFF_CLIENT_SECRET APP_S3_ACCESS_KEY APP_S3_SECRET_KEY BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY TEMPO_S3_ACCESS_KEY TEMPO_S3_SECRET_KEY LOKI_S3_ACCESS_KEY LOKI_S3_SECRET_KEY ALERTMANAGER_SMTP_AUTH_PASSWORD; do
    val="${ENV_MAP[$var]:-}"
    if [[ "$val" == "athyperadmin" ]]; then
      echo "  FAIL  $var = 'athyperadmin' in $ENVIRONMENT environment (dev password leaked to non-local)"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # P2.4 — Traefik workbench upstream must NOT point at host.docker.internal in
  # non-local environments. That hostname only resolves on the dev operator's
  # host; in staging/production the upstream is an in-network Docker service.
  AM_SMARTHOST="${ENV_MAP[ALERTMANAGER_SMTP_SMARTHOST]:-}"
  if [[ "$AM_SMARTHOST" == mailhog:* ]]; then
    echo "  FAIL  ALERTMANAGER_SMTP_SMARTHOST=$AM_SMARTHOST in $ENVIRONMENT (MailHog is local-only)"
    ERRORS=$((ERRORS + 1))
  fi
  AM_REQUIRE_TLS="${ENV_MAP[ALERTMANAGER_SMTP_REQUIRE_TLS]:-}"
  if [[ "$AM_REQUIRE_TLS" != "true" ]]; then
    echo "  FAIL  ALERTMANAGER_SMTP_REQUIRE_TLS=$AM_REQUIRE_TLS in $ENVIRONMENT (must be true outside local)"
    ERRORS=$((ERRORS + 1))
  fi

  UPSTREAM="${ENV_MAP[APPS_ATHYPER_WEB_UPSTREAM_URL]:-}"
  if [[ "$UPSTREAM" == *"host.docker.internal"* ]]; then
    echo "  FAIL  APPS_ATHYPER_WEB_UPSTREAM_URL=$UPSTREAM in $ENVIRONMENT (host.docker.internal is dev-only)"
    ERRORS=$((ERRORS + 1))
  fi

  # P2.4 — RFC 5737 TEST-NET CIDRs are the deploy-blocker fail-safe in the
  # committed workbench templates. If they survive into the deployed dynamic
  # file for a non-local environment, /admin and /ops would reject all traffic.
  # Refuse to start the stack until the allowlist is replaced with real CIDRs.
  WB_FILE="$STACK_DIR/config/gateway/dynamic/athyper.workbench.yml"
  if [[ -f "$WB_FILE" ]]; then
    if grep -qE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.0/24"' "$WB_FILE"; then
      echo "  FAIL  $WB_FILE contains RFC 5737 TEST-NET CIDR in $ENVIRONMENT"
      echo "        Deploy the env-specific template from"
      echo "        stack/config/gateway/environments/ and replace the allowlist"
      echo "        with real VPN CIDR(s) before bringing the stack up."
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # P2.10 — Tempo storage backend. Non-local environments must use s3
  # (MinIO) for durable, lifecycle-managed trace storage. The filesystem
  # backend is single-host and loses unflushed traces on container
  # eviction; acceptable for local dev only.
  TEMPO_BACKEND="${ENV_MAP[TEMPO_STORAGE_BACKEND]:-}"
  if [[ "$TEMPO_BACKEND" != "s3" ]]; then
    echo "  FAIL  TEMPO_STORAGE_BACKEND=$TEMPO_BACKEND in $ENVIRONMENT (must be 's3' outside local)"
    ERRORS=$((ERRORS + 1))
  else
    require_var TEMPO_S3_BUCKET
    require_var TEMPO_S3_ENDPOINT
    require_var TEMPO_S3_ACCESS_KEY
    require_var TEMPO_S3_SECRET_KEY
  fi

  # I-21 — Infisical encryption key: format + default rejection.
  # require_var INFISICAL_ENCRYPTION_KEY (presence) is already checked above.
  IEK="${ENV_MAP[INFISICAL_ENCRYPTION_KEY]:-}"
  if [[ -n "$IEK" ]]; then
    if [[ "$IEK" == "6c1fe4e49cb45b9115d42b127bc5db17" ]]; then
      echo "  FAIL  INFISICAL_ENCRYPTION_KEY = local default in $ENVIRONMENT"
      echo "        Rotate: openssl rand -hex 16"
      ERRORS=$((ERRORS + 1))
    elif ! echo "$IEK" | grep -qE '^[0-9a-fA-F]{32}$'; then
      echo "  FAIL  INFISICAL_ENCRYPTION_KEY is not a 32-char hex string"
      echo "        Generate: openssl rand -hex 16"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # I-21 — Infisical auth secret default rejection.
  IAS="${ENV_MAP[INFISICAL_AUTH_SECRET]:-}"
  if [[ "$IAS" == *"change-me"* || "$IAS" == "athyperadmin"* ]]; then
    echo "  FAIL  INFISICAL_AUTH_SECRET = local default in $ENVIRONMENT"
    echo "        Rotate: openssl rand -base64 32"
    ERRORS=$((ERRORS + 1))
  fi

  # I-18 — Healthchecks secret key default rejection.
  HCK="${ENV_MAP[HEALTHCHECKS_SECRET_KEY]:-}"
  if [[ "$HCK" == *"change-me"* || "$HCK" == "athyperadmin"* ]]; then
    echo "  FAIL  HEALTHCHECKS_SECRET_KEY = local default in $ENVIRONMENT (rotate to a random string)"
    ERRORS=$((ERRORS + 1))
  fi

  # Meilisearch master key default rejection.
  MMK="${ENV_MAP[MEILI_MASTER_KEY]:-}"
  if [[ "$MMK" == *"change-me"* || "$MMK" == "athyperadmin"* ]]; then
    echo "  FAIL  MEILI_MASTER_KEY = local default in $ENVIRONMENT (rotate to a random string)"
    ERRORS=$((ERRORS + 1))
  fi

  # I-03 — Traefik dashboard default htpasswd hash rejection.
  # The committed example contains the bcrypt hash of the dev password 'athyperadmin'.
  GDHP="${ENV_MAP[GATEWAY_DASHBOARD_HTPASSWD]:-}"
  if echo "$GDHP" | grep -q 'NVCnGffZfFqIT\.gM5/QipOXF'; then
    echo "  FAIL  GATEWAY_DASHBOARD_HTPASSWD = local default in $ENVIRONMENT"
    echo "        Rotate: htpasswd -nbB <user> <newpassword>"
    ERRORS=$((ERRORS + 1))
  fi

  # I-20 — ClamAV: freshclam daemon must NOT be disabled outside local dev.
  # Disabling it means ClamAV runs with the signatures baked into the image —
  # new malware will not be detected until the image is rebuilt.
  FRESHCLAM_ND="${ENV_MAP[FRESHCLAM_NO_DAEMON]:-false}"
  if [[ "$FRESHCLAM_ND" == "true" ]]; then
    echo "  FAIL  FRESHCLAM_NO_DAEMON=true in $ENVIRONMENT (stale virus definitions — unset or set to 'false')"
    ERRORS=$((ERRORS + 1))
  fi

  # I-07 — Automated backup: bucket must be configured so the pg_dump backup
  # worker (jobs-backup queue) has a destination to upload snapshots.
  if [[ -z "${ENV_MAP[BACKUP_S3_BUCKET]:-}" ]]; then
    echo "  FAIL  BACKUP_S3_BUCKET is not set in $ENVIRONMENT"
    echo "        Required for the daily pg_dump backup (control.cron_schedule: platform-backup-daily)."
    echo "        Create a dedicated bucket in your object store and set this variable."
    ERRORS=$((ERRORS + 1))
  fi

  # I-11 — MinIO scoped service accounts: APP_S3_*, BACKUP_S3_*, TEMPO_S3_*, and
  # LOKI_S3_* must be set. objectstorage-init provisions these users in MinIO on
  # first stack start using the root credentials.
  require_var APP_S3_ACCESS_KEY
  require_var APP_S3_SECRET_KEY
  require_var BACKUP_S3_ACCESS_KEY
  require_var BACKUP_S3_SECRET_KEY
  require_var TEMPO_S3_ACCESS_KEY
  require_var TEMPO_S3_SECRET_KEY
  require_var LOKI_S3_ACCESS_KEY
  require_var LOKI_S3_SECRET_KEY

  # P2.10 / Loki — storage backend for logs. Mirrors the Tempo requirement:
  # non-local envs must use s3 (MinIO) for durable, lifecycle-managed log storage.
  LOKI_BACKEND="${ENV_MAP[LOKI_STORAGE_BACKEND]:-}"
  if [[ "$LOKI_BACKEND" != "s3" ]]; then
    echo "  FAIL  LOKI_STORAGE_BACKEND=$LOKI_BACKEND in $ENVIRONMENT (must be 's3' outside local)"
    ERRORS=$((ERRORS + 1))
  else
    require_var LOKI_S3_BUCKET
    require_var LOKI_S3_ENDPOINT
  fi

  # Track B4 — analytics profile (Metabase) governance gate.
  # The analytics profile cannot come up in staging/production unless
  # METABASE_GOVERNANCE_APPROVED=approved is set explicitly. That flag
  # is the contract that the four bullets in
  # stack/compose/analytics/README.md ("Before you enable this profile")
  # have been answered: read replica wired, account provisioning
  # decided, schema/PII exposure scoped, audit posture confirmed.
  STACK_PROFILE_VAL="${ENV_MAP[STACK_PROFILE]:-core}"
  if [[ ",$STACK_PROFILE_VAL," == *",analytics,"* ]]; then
    GOV="${ENV_MAP[METABASE_GOVERNANCE_APPROVED]:-}"
    if [[ "$GOV" != "approved" ]]; then
      echo "  FAIL  STACK_PROFILE=$STACK_PROFILE_VAL includes 'analytics' but METABASE_GOVERNANCE_APPROVED='$GOV'"
      echo "        Read stack/compose/analytics/README.md, complete the four"
      echo "        governance bullets, then set METABASE_GOVERNANCE_APPROVED=approved."
      ERRORS=$((ERRORS + 1))
    fi
    # H2 is unsupported beyond the dormant hedge / local exploration.
    MBDB="${ENV_MAP[MB_DB_TYPE]:-h2}"
    if [[ "$MBDB" != "postgres" ]]; then
      echo "  FAIL  MB_DB_TYPE=$MBDB in $ENVIRONMENT (analytics profile requires postgres app DB; H2 is local-only)"
      ERRORS=$((ERRORS + 1))
    fi
    require_var MB_DB_CONNECTION_URI
    # L3 — Metabase must use the dedicated read-only account so that any DML
    # (accidental or via a compromised dashboard query) hard-fails at the DB
    # level. Provision athyper_analytics_ro with GRANT SELECT on relevant
    # schemas and wire it into MB_DB_CONNECTION_URI before enabling analytics.
    MBURI="${ENV_MAP[MB_DB_CONNECTION_URI]:-}"
    if [[ -n "$MBURI" ]] && ! echo "$MBURI" | grep -qiE '(://|:)[^:@/]*analytics_ro[^:@/]*@'; then
      echo "  FAIL  MB_DB_CONNECTION_URI does not reference the 'analytics_ro' account"
      echo "        Provision athyper_analytics_ro (GRANT SELECT on relevant schemas),"
      echo "        add it to PgBouncer's userlist, and update MB_DB_CONNECTION_URI."
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  # L7 — In local dev the API server runs on the host, not inside a container.
  # Pointing APPS_ATHYPER_API_UPSTREAM_URL at a Traefik hostname (e.g.
  # https://api.athyper.local) causes Traefik to route BFF calls back to the
  # container network where the API doesn't exist → 404 on every session/stream
  # request. The value must resolve to the host-side port.
  API_UPSTREAM="${ENV_MAP[APPS_ATHYPER_API_UPSTREAM_URL]:-}"
  if [[ -n "$API_UPSTREAM" ]]; then
    if [[ "$API_UPSTREAM" != http://localhost* && "$API_UPSTREAM" != http://host.docker.internal* ]]; then
      echo "  FAIL  APPS_ATHYPER_API_UPSTREAM_URL=$API_UPSTREAM in local"
      echo "        Must start with http://localhost or http://host.docker.internal"
      echo "        (e.g. http://localhost:4000) — Traefik hostnames loop through"
      echo "        the container network and produce 404s in local dev."
      ERRORS=$((ERRORS + 1))
    fi
  fi
  echo "  OK (local — production security checks skipped)"
fi

# ----------------------------
# 5b. PgBouncer INI template sanity check
# ----------------------------
# Staging/production ini files use __DB_HOST__ / __DB_PORT__ tokens substituted
# at container start. Validate that no tokens are left unrendered and that
# required PgBouncer keys are present. No Docker dependency needed.
# ----------------------------
echo "[5b] PgBouncer template check..."

DBPOOL_APPS_CONFIG_VAL="${ENV_MAP[DBPOOL_APPS_CONFIG]:-}"
if [[ -n "$DBPOOL_APPS_CONFIG_VAL" ]]; then
  DBPOOL_TPL="$STACK_DIR/config/$DBPOOL_APPS_CONFIG_VAL"
  if [[ -f "$DBPOOL_TPL" ]]; then
    RENDERED=$(sed \
      -e "s/__DB_HOST__/pghost-validate/g" \
      -e "s/__DB_PORT__/5432/g" \
      "$DBPOOL_TPL" 2>/dev/null || true)
    PGBOUNCER_ERRORS=0
    for required_key in listen_addr listen_port auth_type pool_mode; do
      if ! echo "$RENDERED" | grep -qE "^${required_key}[[:space:]]*="; then
        echo "  FAIL  PgBouncer template missing required key: $required_key ($DBPOOL_TPL)"
        ERRORS=$((ERRORS + 1))
        PGBOUNCER_ERRORS=$((PGBOUNCER_ERRORS + 1))
      fi
    done
    if echo "$RENDERED" | grep -qE '__[A-Z_]+__'; then
      LEFTOVER=$(echo "$RENDERED" | grep -oE '__[A-Z_]+__' | sort -u | tr '\n' ' ')
      echo "  FAIL  PgBouncer template has unsubstituted tokens: $LEFTOVER ($DBPOOL_TPL)"
      ERRORS=$((ERRORS + 1))
      PGBOUNCER_ERRORS=$((PGBOUNCER_ERRORS + 1))
    fi
    if [[ $PGBOUNCER_ERRORS -eq 0 ]]; then
      echo "  OK"
    fi
  else
    echo "  WARN  PgBouncer template not found: $DBPOOL_TPL (DBPOOL_APPS_CONFIG=$DBPOOL_APPS_CONFIG_VAL)"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  WARN  DBPOOL_APPS_CONFIG not set — skipping PgBouncer template check"
  WARNINGS=$((WARNINGS + 1))
fi

# ----------------------------
# 6. Optional recommendations
# ----------------------------
echo "[6/6] Recommendations..."
# GATEWAY_DASHBOARD_HTPASSWD: warn if absent in local, fail (above) if default in non-local.
if [[ "$ENVIRONMENT" == "local" ]]; then
  warn_var GATEWAY_DASHBOARD_HTPASSWD "Traefik dashboard auth not configured — set to htpasswd string"
fi

if [[ "$ENVIRONMENT" == "local" ]]; then
  warn_var CREDENTIAL_MASTER_KEY "credential encryption disabled (optional in local dev)"
fi

# Object storage: warn if S3_ENDPOINT is not set in local dev.
# The server silently disables attachments when S3_ENDPOINT is absent — the
# warning surfaces this early rather than waiting for an upload to fail.
if [[ "$ENVIRONMENT" == "local" ]]; then
  S3EP="${ENV_MAP[S3_ENDPOINT]:-}"
  if [[ -z "$S3EP" ]]; then
    echo "  WARN  S3_ENDPOINT not set — object storage (file attachments) will be disabled."
    echo "        To enable: set S3_ENDPOINT=http://objectstorage:9000 and S3_ACCESS_KEY/S3_SECRET_KEY."
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# L6 — Alloy (logshipper) config syntax pre-flight.
# If alloy.alloy has a parse error, logshipper enters an immediate crash
# loop on start. This dry-run catches syntax errors before the stack comes
# up. Requires Docker; skipped silently when Docker is unavailable.
ALLOY_CONFIG_PATH="${ATHYPER_CONFIG_VAL}/telemetry/logging/alloy.alloy"
if [[ -f "$ALLOY_CONFIG_PATH" ]] && command -v docker &>/dev/null; then
  ALLOY_ERR_FILE=$(mktemp)
  if ! MSYS_NO_PATHCONV=1 docker run --rm \
      -v "${ALLOY_CONFIG_PATH}:/etc/alloy/config.alloy:ro" \
      grafana/alloy:v1.15.1 validate /etc/alloy/config.alloy >"$ALLOY_ERR_FILE" 2>&1; then
    echo "  WARN  Alloy config has syntax errors — logshipper will crash-loop on start"
    echo "        Config: $ALLOY_CONFIG_PATH"
    sed 's/^/        /' "$ALLOY_ERR_FILE"
    WARNINGS=$((WARNINGS + 1))
  fi
  rm -f "$ALLOY_ERR_FILE"
fi

# Certificate expiry check (all environments)
CERT_FILE="$STACK_DIR/config/gateway/certs/athyper.tls.local.crt"
if [[ -f "$CERT_FILE" ]] && command -v openssl &>/dev/null; then
  if ! openssl x509 -checkend 2592000 -noout -in "$CERT_FILE" 2>/dev/null; then
    echo "  WARN  TLS certificate expires within 30 days — regenerate with generate-certs.sh"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ----------------------------
# Summary
# ----------------------------
echo ""
echo "=========================================="
if [[ $ERRORS -gt 0 ]]; then
  echo "  RESULT: FAILED — $ERRORS error(s), $WARNINGS warning(s)"
  echo "  Fix the errors above before starting the stack."
  echo "=========================================="
  echo ""
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo "  RESULT: PASSED with $WARNINGS warning(s)"
  echo "  Stack will start, but review the warnings above."
  echo "=========================================="
  echo ""
  exit 0
else
  echo "  RESULT: PASSED — all checks OK"
  echo "=========================================="
  echo ""
  exit 0
fi
