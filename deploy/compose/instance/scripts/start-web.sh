#!/bin/sh
set -eu

redis_password="$(cat /run/secrets/redis-password)"
session_key="$(cat /run/secrets/session-token-encryption-key)"
iam_secret="$(cat "${ATHYPER_IAM_SECRET_FILE:?IAM secret file is required}")"

REDIS_URL="$(node -e 'process.stdout.write("redis://:"+encodeURIComponent(process.argv[1])+"@memorycache:6379")' "$redis_password")"
SESSION_TOKEN_ENCRYPTION_KEY="$session_key"
KEYCLOAK_CLIENT_SECRET="$iam_secret"
KEYCLOAK_BASE_URL=http://iam:8080
KEYCLOAK_REALM=athyper
KEYCLOAK_CLIENT_ID="$ATHYPER_IAM_CLIENT_ID"
RUNTIME_API_URL=http://api:4000
PUBLIC_BASE_URL="http://${ATHYPER_APP_DOMAIN}"
PUBLIC_WEB_URL="$PUBLIC_BASE_URL"
APP_ORIGIN="$PUBLIC_BASE_URL"
ALLOWED_HOSTS="$ATHYPER_APP_DOMAIN"
NODE_ENV=production
PORT=3000
export REDIS_URL SESSION_TOKEN_ENCRYPTION_KEY KEYCLOAK_CLIENT_SECRET KEYCLOAK_BASE_URL
export KEYCLOAK_REALM KEYCLOAK_CLIENT_ID RUNTIME_API_URL PUBLIC_BASE_URL PUBLIC_WEB_URL
export APP_ORIGIN ALLOWED_HOSTS NODE_ENV PORT
unset redis_password session_key iam_secret
exec node "apps/${ATHYPER_APP_ID}/server.js"
