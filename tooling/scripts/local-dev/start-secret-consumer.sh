#!/bin/sh
set -eu

# File-backed Compose secrets preserve host permissions. Read as root, then
# drop privileges before starting consumers whose image UID differs from the host.
case "$1" in
  telemetry)
    GF_SECURITY_ADMIN_PASSWORD="$(cat /run/secrets/grafana-admin-password)"
    test -n "$GF_SECURITY_ADMIN_PASSWORD"
    export GF_SECURITY_ADMIN_PASSWORD
    unset GF_SECURITY_ADMIN_PASSWORD__FILE
    exec su -p -s /bin/sh grafana -c 'exec /run.sh'
    ;;
  memorycache-exporter|jobqueue-exporter|secretstore-cache-exporter)
    REDIS_PASSWORD="$(cat /run/secrets/redis-password)"
    test -n "$REDIS_PASSWORD"
    export REDIS_PASSWORD
    # REDIS_PASSWORD_FILE expects the exporter's JSON mapping, not a plain secret.
    unset REDIS_PASSWORD_FILE
    exec su -p -s /bin/sh nobody -c 'exec /redis_exporter'
    ;;
  *) echo "Unknown local secret consumer" >&2; exit 1 ;;
esac
