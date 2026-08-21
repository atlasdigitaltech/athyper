#!/bin/sh
set -eu

MB_DB_PASS="$(cat /run/secrets/analytics-db-password)"
export MB_DB_PASS
exec "$@"
