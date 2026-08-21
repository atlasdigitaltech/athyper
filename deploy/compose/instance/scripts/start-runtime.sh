#!/bin/sh
set -eu

encode_file() {
  node -e 'const fs=require("fs");process.stdout.write(encodeURIComponent(fs.readFileSync(process.argv[1],"utf8").trim()))' "$1"
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

export ATHYPER_ENV=local PORT=4000 LOG_LEVEL=info SHUTDOWN_TIMEOUT_MS=20000
export IAM_ISSUER_URL=http://iam:8080/realms/athyper IAM_CLIENT_ID=athyper-api-runtime
export S3_ENDPOINT=http://objectstorage:9000 S3_REGION=us-east-1 S3_BUCKET=athyper-documents S3_USE_SSL=false
export CLAMD_HOST=virusscan CLAMD_PORT=3310 CLAMD_ON_UNAVAILABLE=fail-closed
export DOCRENDER_BASE_URL=http://docrender:3000 DOCPARSER_URL=http://docparser:9998
export SEARCHCORE_URL=http://searchcore:7700 SEARCHCORE_DOCUMENT_INDEX=documents
export SMTP_HOST=mailtrap SMTP_PORT=1025 SMTP_SECURE=false SMTP_FROM="noreply@${ATHYPER_DOMAIN_SUFFIX:-dev.athyper.test}"
export PUBLICATION_API_ENABLED=false PUBLICATION_COMPILE_ENABLED=false
export PUBLICATION_DISPATCH_ENABLED=false PUBLICATION_APPLY_ENABLED=false PUBLICATION_RECOVERY_ENABLED=false

unset runtime_password worker_password redis_password
exec node dist/main.js
