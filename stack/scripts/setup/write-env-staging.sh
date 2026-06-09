#!/usr/bin/env bash
# ============================================================
# athyper Stack — Staging Secret Generation + .env Writer
# Location:
#   stack/scripts/setup/write-env-staging.sh
# Usage (run as root):
#   export ACME_EMAIL="ops@yourdomain.com"
#   bash /opt/products/athyper/stack/scripts/setup/write-env-staging.sh
#
# What it does (one pass, no manual copy-paste):
#   1. Generates all required secrets with exact .env variable names
#   2. Generates Traefik gateway htpasswd from IAM_ADMIN_PASSWORD
#   3. Saves a plain-text backup to /home/athyper/secrets-staging-values.txt (0600)
#   4. Writes the secrets-only /opt/stack/athyper/secrets/.env
#      (non-secret config lives in stack/env/.env ← staging.env.example)
#   5. Sets athyper:athyper 600 ownership on the .env
#
# Prerequisites:
#   - Run as root (secrets/ dir is root:athyper 750 — only root can create files)
#   - ACME_EMAIL exported before running
#   - Docker available (pulls httpd:alpine for bcrypt htpasswd)
#   - /opt/stack/athyper/secrets/ directory exists (Phase 3)
# ============================================================

set -euo pipefail

SECRETS_FILE="/home/athyper/secrets-staging-values.txt"
ENV_FILE="/opt/stack/athyper/secrets/.env"

# ── Pre-flight ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo ""
  echo "ERROR: This script must be run as root."
  echo "       secrets/ is root:athyper 750 — only root can create files there."
  echo ""
  echo "  sudo bash $0"
  echo ""
  exit 1
fi

if [[ -z "${ACME_EMAIL:-}" ]]; then
  echo ""
  echo "ERROR: ACME_EMAIL is not set."
  echo ""
  echo "  export ACME_EMAIL=\"ops@yourdomain.com\""
  echo "  bash $0"
  echo ""
  exit 1
fi

if [[ ! -d "$(dirname "$ENV_FILE")" ]]; then
  echo "ERROR: $(dirname "$ENV_FILE") does not exist."
  echo "       Run Phase 3 (data-dirs-create.sh) first."
  exit 1
fi

if [[ -f "$ENV_FILE" ]] && [[ -s "$ENV_FILE" ]]; then
  echo ""
  echo "WARNING: $ENV_FILE already exists and is non-empty."
  read -p "Overwrite? All secrets will rotate and must be re-applied everywhere. [y/N] " ans
  [[ "${ans,,}" == "y" ]] || { echo "Aborted."; exit 0; }
  echo ""
fi

# ── Suppress bash history ──────────────────────────────────────────────────
unset HISTFILE
set +o history

echo ""
echo "=== Athyper Staging — Secret Generation + .env Write ==="
echo ""
echo "Step 1/4  Generating platform secrets..."

# ── Generate all secrets ───────────────────────────────────────────────────
CREDENTIAL_MASTER_KEY=$(openssl rand -base64 48 | tr -d '\n=')
# DB_ADMIN_PASSWORD uses hex (not base64) so it is safe to embed in a JDBC/libpq
# connection URL without percent-encoding. Base64 passwords contain '+' and '/'
# which are reserved URL characters — they cause "Invalid URL" errors in Node.js
# when the password appears verbatim in postgresql://user:PASS@host/db strings.
DB_ADMIN_PASSWORD=$(openssl rand -hex 32)
# Both PgBouncer pools proxy the postgres superuser — their userlist.txt must
# carry the same password so client auth and backend auth both succeed.
DBPOOL_APPS_PASSWORD=$DB_ADMIN_PASSWORD
DBPOOL_SESSION_PASSWORD=$DB_ADMIN_PASSWORD
IAM_ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
IAM_CLIENT_SECRET=$(openssl rand -hex 32)
ADMIN_WEB_CLIENT_SECRET=$(openssl rand -hex 32)
ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=$(openssl rand -hex 32)
NEON_SVC_BFF_CLIENT_SECRET=$(openssl rand -hex 32)
AUTH_DISCOVERY_SHARED_SECRET=$(openssl rand -hex 32)
MEMORYCACHE_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
REDIS_EXPORTER_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
REDIS_GLITCHTIP_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
REDIS_INFISICAL_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
REDIS_ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
S3_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')
APP_S3_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')
BACKUP_S3_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')
TEMPO_S3_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')
LOKI_S3_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')
RENDERER_INTERNAL_TOKEN=$(openssl rand -hex 32)
INFISICAL_ENCRYPTION_KEY=$(openssl rand -hex 16)
INFISICAL_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n=')
TELEMETRY_ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '\n=')
MEILI_MASTER_KEY=$(openssl rand -base64 32 | tr -d '\n=')
CRONWATCH_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')
ERRORCOLLECT_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')

echo "Step 2/4  Generating gateway htpasswd (pulling httpd:alpine if needed)..."
GATEWAY_DASHBOARD_HTPASSWD=$(
  docker run --rm httpd:alpine htpasswd -nbB admin "$IAM_ADMIN_PASSWORD" \
    | sed 's/\$/\$\$/g'
)

# ── Save secrets backup ────────────────────────────────────────────────────
echo "Step 3/4  Writing secrets backup to $SECRETS_FILE..."
cat > "$SECRETS_FILE" << SECRETS
# Athyper Staging Secrets — generated $(date -Iseconds)
# KEEP SECURE (0600). Copy to a password manager, then delete this file
# from the server once the stack is confirmed healthy.
#
# GATEWAY_DASHBOARD_HTPASSWD is derived from IAM_ADMIN_PASSWORD.
# To regenerate: docker run --rm httpd:alpine htpasswd -nbB admin "<IAM_ADMIN_PASSWORD>"
#   then replace each $ with $$ for Docker Compose.

CREDENTIAL_MASTER_KEY=$CREDENTIAL_MASTER_KEY
DB_ADMIN_PASSWORD=$DB_ADMIN_PASSWORD
DBPOOL_APPS_PASSWORD=$DBPOOL_APPS_PASSWORD
DBPOOL_SESSION_PASSWORD=$DBPOOL_SESSION_PASSWORD
IAM_ADMIN_PASSWORD=$IAM_ADMIN_PASSWORD
IAM_CLIENT_SECRET=$IAM_CLIENT_SECRET
ADMIN_WEB_CLIENT_SECRET=$ADMIN_WEB_CLIENT_SECRET
ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=$ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET
NEON_SVC_BFF_CLIENT_SECRET=$NEON_SVC_BFF_CLIENT_SECRET
AUTH_DISCOVERY_SHARED_SECRET=$AUTH_DISCOVERY_SHARED_SECRET
MEMORYCACHE_PASSWORD=$MEMORYCACHE_PASSWORD
REDIS_EXPORTER_PASSWORD=$REDIS_EXPORTER_PASSWORD
REDIS_GLITCHTIP_PASSWORD=$REDIS_GLITCHTIP_PASSWORD
REDIS_INFISICAL_PASSWORD=$REDIS_INFISICAL_PASSWORD
REDIS_ADMIN_PASSWORD=$REDIS_ADMIN_PASSWORD
S3_SECRET_KEY=$S3_SECRET_KEY
APP_S3_SECRET_KEY=$APP_S3_SECRET_KEY
BACKUP_S3_SECRET_KEY=$BACKUP_S3_SECRET_KEY
TEMPO_S3_SECRET_KEY=$TEMPO_S3_SECRET_KEY
LOKI_S3_SECRET_KEY=$LOKI_S3_SECRET_KEY
RENDERER_INTERNAL_TOKEN=$RENDERER_INTERNAL_TOKEN
INFISICAL_ENCRYPTION_KEY=$INFISICAL_ENCRYPTION_KEY
INFISICAL_AUTH_SECRET=$INFISICAL_AUTH_SECRET
TELEMETRY_ADMIN_PASSWORD=$TELEMETRY_ADMIN_PASSWORD
MEILI_MASTER_KEY=$MEILI_MASTER_KEY
CRONWATCH_SECRET_KEY=$CRONWATCH_SECRET_KEY
ERRORCOLLECT_SECRET_KEY=$ERRORCOLLECT_SECRET_KEY
ACME_EMAIL=$ACME_EMAIL
SECRETS
chmod 0600 "$SECRETS_FILE"

# ── Write secrets-only .env ───────────────────────────────────────────────────
# Non-secret config (ENVIRONMENT, NODE_ENV, hostnames, paths, IAM endpoints,
# memory limits, etc.) lives in stack/env/.env ← staging.env.example.
# This file contains ONLY generated secrets, credential compound URLs, and a
# small set of operator-specific values that staging.env.example marks as
# "injected from secrets/.env".  Docker compose merges both files; this file
# wins on any duplicate keys.
echo "Step 4/4  Writing $ENV_FILE..."
tee "$ENV_FILE" > /dev/null << ENVEOF
# ── Credential encryption ─────────────────────────────────────────────────────
CREDENTIAL_MASTER_KEY=$CREDENTIAL_MASTER_KEY

# ── Database passwords + compound URLs ───────────────────────────────────────
# Non-secret DB config (DB_HOST, DB_PORT, DBPOOL_*_CONFIG, etc.) is in bootstrap.
DB_ADMIN_PASSWORD=$DB_ADMIN_PASSWORD
DBPOOL_APPS_USER=postgres
DBPOOL_APPS_PASSWORD=$DBPOOL_APPS_PASSWORD
DBPOOL_SESSION_USER=postgres
DBPOOL_SESSION_PASSWORD=$DBPOOL_SESSION_PASSWORD
DATABASE_URL=postgresql://postgres:$DB_ADMIN_PASSWORD@athyper-db-1:5432/athyper_neon
DATABASE_ADMIN_URL=postgresql://postgres:$DB_ADMIN_PASSWORD@athyper-db-1:5432/athyper_neon

# ── Redis ─────────────────────────────────────────────────────────────────────
MEMORYCACHE_PASSWORD=$MEMORYCACHE_PASSWORD
REDIS_URL=redis://:$MEMORYCACHE_PASSWORD@athyper-memorycache-1:6379/0
REDIS_EXPORTER_PASSWORD=$REDIS_EXPORTER_PASSWORD
REDIS_GLITCHTIP_PASSWORD=$REDIS_GLITCHTIP_PASSWORD
REDIS_INFISICAL_PASSWORD=$REDIS_INFISICAL_PASSWORD
REDIS_ADMIN_PASSWORD=$REDIS_ADMIN_PASSWORD

# ── IAM (Keycloak) ────────────────────────────────────────────────────────────
# Non-secret IAM config (IAM_ADMIN, IAM_CLIENT_ID, IAM_DB_URL, IAM_DB_USERNAME,
# IAM_ISSUER_URL, KEYCLOAK_IMAGE_TAG, etc.) is in bootstrap.
IAM_ADMIN_PASSWORD=$IAM_ADMIN_PASSWORD
IAM_CLIENT_SECRET=$IAM_CLIENT_SECRET
ADMIN_WEB_CLIENT_SECRET=$ADMIN_WEB_CLIENT_SECRET
ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET=$ATHYPER_SVC_RUNTIME_WORKER_CLIENT_SECRET
NEON_SVC_BFF_CLIENT_SECRET=$NEON_SVC_BFF_CLIENT_SECRET
AUTH_DISCOVERY_SHARED_SECRET=$AUTH_DISCOVERY_SHARED_SECRET
IAM_DB_PASSWORD=$DB_ADMIN_PASSWORD
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=$IAM_ADMIN_PASSWORD
ATHYPER_SUPER__IAM_SECRET__IAM_ATHYPER_CLIENT_SECRET=$IAM_CLIENT_SECRET

# ── Object storage (MinIO S3) ────────────────────────────────────────────────
# S3_REGION, S3_USE_SSL, TEMPO_S3_*/LOKI_S3_* non-credential vars are in bootstrap.
S3_ACCESS_KEY=athyper-minio-root
S3_SECRET_KEY=$S3_SECRET_KEY
S3_ENDPOINT=http://objectstorage:9000
S3_BUCKET=athyper-staging
APP_S3_ACCESS_KEY=athyper-app
APP_S3_SECRET_KEY=$APP_S3_SECRET_KEY
BACKUP_S3_ACCESS_KEY=athyper-backup
BACKUP_S3_SECRET_KEY=$BACKUP_S3_SECRET_KEY
BACKUP_S3_BUCKET=athyper-backups
BACKUP_S3_ENDPOINT=http://objectstorage:9000
BACKUP_S3_REGION=us-east-1
TEMPO_S3_ACCESS_KEY=athyper-tempo
TEMPO_S3_SECRET_KEY=$TEMPO_S3_SECRET_KEY
LOKI_S3_ACCESS_KEY=athyper-loki
LOKI_S3_SECRET_KEY=$LOKI_S3_SECRET_KEY

# ── Telemetry ─────────────────────────────────────────────────────────────────
TELEMETRY_ADMIN_USER=admin
TELEMETRY_ADMIN_PASSWORD=$TELEMETRY_ADMIN_PASSWORD
OTLP_ENDPOINT=http://logshipper:4318

# ── Infisical ─────────────────────────────────────────────────────────────────
INFISICAL_ENCRYPTION_KEY=$INFISICAL_ENCRYPTION_KEY
INFISICAL_AUTH_SECRET=$INFISICAL_AUTH_SECRET

# ── Renderer ──────────────────────────────────────────────────────────────────
RENDERER_INTERNAL_TOKEN=$RENDERER_INTERNAL_TOKEN

# ── Search ────────────────────────────────────────────────────────────────────
MEILI_MASTER_KEY=$MEILI_MASTER_KEY

# ── Monitoring ────────────────────────────────────────────────────────────────
CRONWATCH_SECRET_KEY=$CRONWATCH_SECRET_KEY
ERRORCOLLECT_SECRET_KEY=$ERRORCOLLECT_SECRET_KEY

# ── Gateway ───────────────────────────────────────────────────────────────────
ACME_EMAIL=$ACME_EMAIL
GATEWAY_DASHBOARD_HTPASSWD=$GATEWAY_DASHBOARD_HTPASSWD
ENVEOF

# ── Restore ownership ──────────────────────────────────────────────────────
chown athyper:athyper "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ── Restore history ────────────────────────────────────────────────────────
set -o history
export HISTFILE=~/.bash_history

echo ""
echo "=== Done ==="
echo ""
echo "  Secrets backup : $SECRETS_FILE  (0600)"
echo "  Env file       : $ENV_FILE  (athyper:athyper 600)"
echo ""
echo "Verify:"
echo "  stat -c \"%U:%G %a %n\" $ENV_FILE"
echo "  wc -l $ENV_FILE"
echo ""
echo "Next — Phase 10:"
echo "  sudo -u athyper bash /opt/products/athyper/stack/scripts/setup/validate-env.sh \
    /opt/products/athyper/stack/env/.env \
    /opt/stack/athyper/secrets/.env"
echo ""
