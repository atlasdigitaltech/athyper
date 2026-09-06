#!/bin/sh
set -eu

ENCRYPTION_KEY="$(cat /run/secrets/infisical-encryption-key)"
AUTH_SECRET="$(cat /run/secrets/infisical-auth-secret)"
db_password="$(cat /run/secrets/infisical-db-password)"
redis_password="$(cat /run/secrets/redis-password)"
export ENCRYPTION_KEY AUTH_SECRET
export DB_CONNECTION_URI="postgresql://athyper_infisical:${db_password}@db:5432/athyper_infisical"
export REDIS_URL="redis://:${redis_password}@memorycache:6379"
unset db_password redis_password

if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid="$(id -u non-root-user)" \
    --regid="$(id -g non-root-user)" --init-groups -- "$@"
fi
exec "$@"
