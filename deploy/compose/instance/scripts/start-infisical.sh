#!/bin/sh
set -eu

ENCRYPTION_KEY="$(cat /run/secrets/infisical-encryption-key)"
AUTH_SECRET="$(cat /run/secrets/infisical-auth-secret)"
encode_password() {
  node -e 'const b=require("fs").readFileSync(process.argv[1]);if(!b.length||b.length>1024||b.some(c=>c===0||c===10||c===13)||!Buffer.from(b.toString("utf8")).equals(b)){console.error("Password must contain 1..1024 bytes without NUL, CR or LF");process.exit(1)}process.stdout.write(encodeURIComponent(b.toString("utf8")))' "$1"
}
db_password="$(encode_password /run/secrets/infisical-db-password)"
redis_password="$(encode_password /run/secrets/redis-password)"
export ENCRYPTION_KEY AUTH_SECRET
export DB_CONNECTION_URI="postgresql://athyper_infisical:${db_password}@db:5432/athyper_infisical"
export REDIS_URL="redis://:${redis_password}@memorycache:6379"
unset db_password redis_password

if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid="$(id -u non-root-user)" \
    --regid="$(id -g non-root-user)" --init-groups -- "$@"
fi
exec "$@"
