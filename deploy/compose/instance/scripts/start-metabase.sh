#!/bin/sh
set -eu

MB_DB_PASS="$(cat /run/secrets/analytics-db-password)"
export MB_DB_PASS
if [ "$(id -u)" = 0 ]; then
  # The derived image creates this account at build time. Its BusyBox setpriv
  # cannot change UIDs; su takes upstream's non-root startup path instead.
  exec su -p -s /bin/sh metabase -c 'exec "$@"' metabase "$@"
fi
exec "$@"
