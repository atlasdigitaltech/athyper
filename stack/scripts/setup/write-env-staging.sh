#!/usr/bin/env bash
# ============================================================
# athyper Stack — Staging Secret Generation + .env Writer
# Location:
#   stack/scripts/setup/write-env-staging.sh
# Usage:
#   export ACME_EMAIL="ops@yourdomain.com"
#   bash /opt/products/athyper/stack/scripts/setup/write-env-staging.sh
#
# What it does (one pass, no manual copy-paste):
#   1. Generates all 22 required secrets with exact .env variable names
#   2. Generates Traefik gateway htpasswd from IAM_ADMIN_PASSWORD
#   3. Saves a plain-text backup to ~/secrets-staging-values.txt (0600)
#   4. Writes the complete /opt/stack/athyper/secrets/.env via sudo tee
#   5. Restores athyper:athyper 600 ownership on the .env
#
# Prerequisites:
#   - Run as the athyper service account (sudo-capable)
#   - ACME_EMAIL exported before running
#   - Docker available (pulls httpd:alpine for bcrypt htpasswd)
#   - /opt/stack/athyper/secrets/ directory exists (Phase 3)
# ============================================================

set -euo pipefail

SECRETS_FILE="$HOME/secrets-staging-values.txt"
ENV_FILE="/opt/stack/athyper/secrets/.env"

# ── Pre-flight ─────────────────────────────────────────────────────────────
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
echo "Step 1/4  Generating 22 secrets..."

# ── Generate all secrets ───────────────────────────────────────────────────
CREDENTIAL_MASTER_KEY=$(openssl rand -base64 48 | tr -d '\n=')
DB_ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
DBPOOL_APPS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
DBPOOL_SESSION_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
IAM_ADMIN_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')
IAM_CLIENT_SECRET=$(openssl rand -hex 32)
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
HEALTHCHECKS_SECRET_KEY=$(openssl rand -base64 32 | tr -d '\n=')

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
HEALTHCHECKS_SECRET_KEY=$HEALTHCHECKS_SECRET_KEY
ACME_EMAIL=$ACME_EMAIL
SECRETS
chmod 0600 "$SECRETS_FILE"

# ── Write the complete .env ────────────────────────────────────────────────
echo "Step 4/4  Writing $ENV_FILE..."
sudo tee "$ENV_FILE" > /dev/null << ENVEOF
# ── Identity ──────────────────────────────────────────────────────────────────
ENVIRONMENT=staging
COMPOSE_PROJECT_NAME=athyper
NODE_ENV=production
NODE_TLS_REJECT_UNAUTHORIZED=1

# ── Six-root paths ────────────────────────────────────────────────────────────
ATHYPER_ROOT=/opt/products/athyper
ATHYPER_STACK_ROOT=/opt/products/athyper/stack
ATHYPER_CONFIG_ROOT=/opt/stack/athyper/config
ATHYPER_CONFIG=/opt/stack/athyper/config
ATHYPER_DATA=/opt/stack/athyper/data
ATHYPER_SECRETS_ROOT=/opt/stack/athyper/secrets
ATHYPER_LOGS=/opt/stack/athyper/logs
ATHYPER_BACKUPS=/opt/stack/athyper/backups

# ── Kernel config ─────────────────────────────────────────────────────────────
ATHYPER_KERNEL_CONFIG_PATH=apps/kernel.config.parameter.json

# ── Public URLs ───────────────────────────────────────────────────────────────
PUBLIC_BASE_URL=https://api-stg.athyper.com
PUBLIC_WEB_URL=https://neon-stg.athyper.com

# ── Hostnames ─────────────────────────────────────────────────────────────────
APPS_ATHYPER_WEB_HOST=neon-stg.athyper.com
APPS_ATHYPER_API_HOST=api-stg.athyper.com
APPS_ATHYPER_WEB_UPSTREAM_URL=http://athyper-neon-web-1:3000
GATEWAY_HOST=gateway-stg.athyper.com
IAM_HOST=iam-stg.athyper.com
IAM_ISSUER_URL=https://iam-stg.athyper.com/realms/athyper

# ── Database ──────────────────────────────────────────────────────────────────
DB_HOST=athyper-db-1
DB_PORT=5432
DATABASE_URL=postgresql://postgres:$DB_ADMIN_PASSWORD@athyper-db-1:5432/athyper_platform
DB_ADMIN_PASSWORD=$DB_ADMIN_PASSWORD
DBPOOL_APPS_HOST=athyper-dbpool-apps-1
DBPOOL_APPS_PORT=6432
DBPOOL_SESSION_HOST=athyper-dbpool-session-1
DBPOOL_SESSION_PORT=6433
DBPOOL_APPS_PASSWORD=$DBPOOL_APPS_PASSWORD
DBPOOL_SESSION_PASSWORD=$DBPOOL_SESSION_PASSWORD
DBPOOL_APPS_CONFIG=db/staging/dbpool/apps/pgbouncer-apps.ini
DBPOOL_SESSION_CONFIG=db/staging/dbpool/session/pgbouncer-session.ini

# ── Credentials ───────────────────────────────────────────────────────────────
CREDENTIAL_MASTER_KEY=$CREDENTIAL_MASTER_KEY

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://:$MEMORYCACHE_PASSWORD@athyper-memorycache-1:6379/0
MEMORYCACHE_PASSWORD=$MEMORYCACHE_PASSWORD
REDIS_EXPORTER_PASSWORD=$REDIS_EXPORTER_PASSWORD
REDIS_GLITCHTIP_PASSWORD=$REDIS_GLITCHTIP_PASSWORD
REDIS_INFISICAL_PASSWORD=$REDIS_INFISICAL_PASSWORD
REDIS_ADMIN_PASSWORD=$REDIS_ADMIN_PASSWORD

# ── IAM (Keycloak) ────────────────────────────────────────────────────────────
IAM_ADMIN_PASSWORD=$IAM_ADMIN_PASSWORD
IAM_CLIENT_SECRET=$IAM_CLIENT_SECRET

# ── Object storage (MinIO) ────────────────────────────────────────────────────
S3_ACCESS_KEY=athyper-minio-root
S3_SECRET_KEY=$S3_SECRET_KEY
S3_ENDPOINT=http://athyper-objectstorage-1:9000
APP_S3_ACCESS_KEY=athyper-app
APP_S3_SECRET_KEY=$APP_S3_SECRET_KEY
BACKUP_S3_ACCESS_KEY=athyper-backup
BACKUP_S3_SECRET_KEY=$BACKUP_S3_SECRET_KEY
TEMPO_S3_ACCESS_KEY=athyper-tempo
TEMPO_S3_SECRET_KEY=$TEMPO_S3_SECRET_KEY
LOKI_S3_ACCESS_KEY=athyper-loki
LOKI_S3_SECRET_KEY=$LOKI_S3_SECRET_KEY
BACKUP_S3_BUCKET=athyper-backups
BACKUP_S3_ENDPOINT=http://athyper-objectstorage-1:9000
BACKUP_S3_REGION=us-east-1
TEMPO_S3_BUCKET=athyper-tempo
TEMPO_S3_ENDPOINT=http://athyper-objectstorage-1:9000
LOKI_S3_BUCKET=athyper-loki
LOKI_S3_ENDPOINT=http://athyper-objectstorage-1:9000

# ── Telemetry storage ─────────────────────────────────────────────────────────
TEMPO_STORAGE_BACKEND=s3
LOKI_STORAGE_BACKEND=s3

# ── Telemetry admin (Grafana) ─────────────────────────────────────────────────
TELEMETRY_ADMIN_USER=admin
TELEMETRY_ADMIN_PASSWORD=$TELEMETRY_ADMIN_PASSWORD

# ── Infisical ─────────────────────────────────────────────────────────────────
INFISICAL_ENCRYPTION_KEY=$INFISICAL_ENCRYPTION_KEY
INFISICAL_AUTH_SECRET=$INFISICAL_AUTH_SECRET

# ── Renderer ──────────────────────────────────────────────────────────────────
RENDERER_INTERNAL_TOKEN=$RENDERER_INTERNAL_TOKEN

# ── Search ────────────────────────────────────────────────────────────────────
MEILI_MASTER_KEY=$MEILI_MASTER_KEY

# ── Healthchecks ─────────────────────────────────────────────────────────────
HEALTHCHECKS_SECRET_KEY=$HEALTHCHECKS_SECRET_KEY

# ── Gateway ───────────────────────────────────────────────────────────────────
ACME_EMAIL=$ACME_EMAIL
GATEWAY_DASHBOARD_HTPASSWD=$GATEWAY_DASHBOARD_HTPASSWD
ENVEOF

# ── Restore ownership ──────────────────────────────────────────────────────
sudo chown athyper:athyper "$ENV_FILE"
sudo chmod 600 "$ENV_FILE"

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
echo "  sudo -u athyper bash /opt/products/athyper/stack/scripts/setup/validate-env.sh staging"
echo ""
