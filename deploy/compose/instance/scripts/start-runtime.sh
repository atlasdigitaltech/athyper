#!/bin/sh
set -eu

encode_file() {
  node -e 'const fs=require("fs");process.stdout.write(encodeURIComponent(fs.readFileSync(process.argv[1],"utf8").trim()))' "$1"
}

load_optional_secret() {
  variable="$1"
  secret_file="$(printenv "${variable}_FILE" 2>/dev/null || true)"
  [ -n "$secret_file" ] || return 0
  [ -f "$secret_file" ] || {
    echo "Secret file configured by ${variable}_FILE is unavailable" >&2
    exit 1
  }
  secret_value="$(cat "$secret_file")"
  [ -n "$secret_value" ] || {
    echo "Secret file configured by ${variable}_FILE is empty" >&2
    exit 1
  }
  export "$variable=$secret_value"
  unset secret_file secret_value
}

runtime_password="$(encode_file /run/secrets/runtime-db-password)"
worker_password="$(encode_file /run/secrets/worker-db-password)"
redis_password="$(encode_file /run/secrets/redis-password)"

DATABASE_URL="postgresql://athyper_runtime:${runtime_password}@dbpool-apps:5432/athyper_neon"
STUDIO_DATABASE_URL="postgresql://athyper_runtime:${runtime_password}@dbpool-apps:5432/athyper_studio"
MESH_DATABASE_URL="postgresql://athyper_runtime:${runtime_password}@dbpool-apps:5432/athyper_mesh"
NEON_WORKER_DATABASE_URL="postgresql://athyper_worker:${worker_password}@dbpool-session:5432/athyper_neon"
STUDIO_WORKER_DATABASE_URL="postgresql://athyper_worker:${worker_password}@dbpool-session:5432/athyper_studio"
MESH_WORKER_DATABASE_URL="postgresql://athyper_worker:${worker_password}@dbpool-session:5432/athyper_mesh"
REDIS_URL="redis://:${redis_password}@memorycache:6379"
REDIS_BULLMQ_URL="$REDIS_URL"
export DATABASE_URL STUDIO_DATABASE_URL MESH_DATABASE_URL
export NEON_WORKER_DATABASE_URL STUDIO_WORKER_DATABASE_URL MESH_WORKER_DATABASE_URL
export REDIS_URL REDIS_BULLMQ_URL

IAM_CLIENT_SECRET="$(cat /run/secrets/runtime-iam-client-secret)"
APP_S3_ACCESS_KEY="$(cat /run/secrets/objectstorage-app-access-key)"
APP_S3_SECRET_KEY="$(cat /run/secrets/objectstorage-app-secret-key)"
SEARCHCORE_MASTER_KEY="$(cat /run/secrets/search-master-key)"
export IAM_CLIENT_SECRET APP_S3_ACCESS_KEY APP_S3_SECRET_KEY SEARCHCORE_MASTER_KEY

export ATHYPER_ENV="${ATHYPER_ENV:-local}" PORT=4000 LOG_LEVEL=info SHUTDOWN_TIMEOUT_MS=20000
export IAM_ISSUER_URL="https://iam.${ATHYPER_DOMAIN_SUFFIX:-dev.athyper.test}/realms/athyper" IAM_CLIENT_ID=athyper-api-runtime
export KEYCLOAK_REALM=athyper
export KEYCLOAK_JWKS_URL=http://iam:8080/realms/athyper/protocol/openid-connect/certs
export S3_ENDPOINT=http://objectstorage:9000 S3_REGION=us-east-1 S3_BUCKET=athyper-documents S3_USE_SSL=false
export S3_PUBLIC_ENDPOINT="${S3_PUBLIC_ENDPOINT:-https://objects.${ATHYPER_DOMAIN_SUFFIX:-dev.athyper.test}}"
export CLAMD_HOST=virusscan CLAMD_PORT=3310 CLAMD_ON_UNAVAILABLE=fail-closed
export DOCRENDER_BASE_URL=http://docrender:3000 DOCPARSER_URL=http://docparser:9998
export SEARCHCORE_URL=http://searchcore:7700 SEARCHCORE_DOCUMENT_INDEX=documents
SMTP_HOST="${SMTP_HOST:-mailtrap}"
SMTP_PORT="${SMTP_PORT:-1025}"
SMTP_SECURE="${SMTP_SECURE:-false}"
SMTP_FROM="${SMTP_FROM:-noreply@${ATHYPER_DOMAIN_SUFFIX:-dev.athyper.test}}"
export SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_FROM

# Provider secrets may be injected directly by an orchestrator or through the
# conventional *_FILE variables used by Docker/Kubernetes secret mounts. The
# local stack intentionally supplies none of these and continues to use Mailpit.
for provider_secret in \
  MASTER_DATA_VERIFICATION_KEYS_JSON LOCAL_CONTACT_CHALLENGE_PRIVATE_KEY LOCAL_CONTACT_CHALLENGE_DELIVERY_KEY \
  SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_FROM SMTP_USER SMTP_PASS \
  TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_NUMBER TWILIO_MESSAGING_SERVICE_SID \
  META_WHATSAPP_API_VERSION META_WHATSAPP_PHONE_NUMBER_ID META_WHATSAPP_ACCESS_TOKEN \
  PUSH_FCM_PROJECT_ID PUSH_FCM_CLIENT_EMAIL PUSH_FCM_PRIVATE_KEY \
  VAPID_SUBJECT VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY INFISICAL_TOKEN; do
  load_optional_secret "$provider_secret"
done
unset provider_secret
: "${PUBLICATION_API_ENABLED:=false}" "${PUBLICATION_COMPILE_ENABLED:=false}"
: "${PUBLICATION_DISPATCH_ENABLED:=false}" "${PUBLICATION_APPLY_ENABLED:=false}" "${PUBLICATION_RECOVERY_ENABLED:=false}"
export PUBLICATION_API_ENABLED PUBLICATION_COMPILE_ENABLED PUBLICATION_DISPATCH_ENABLED PUBLICATION_APPLY_ENABLED PUBLICATION_RECOVERY_ENABLED

unset runtime_password worker_password redis_password
exec node dist/main.js
