#!/bin/sh
set -eu
# The exporter --redis.password-file expects a JSON address/password map,
# whereas our shared secret is raw password bytes. Pass it through the
# process environment, never Docker configuration or command arguments.
REDIS_PASSWORD="$(cat /run/secrets/redis-password; printf '.')"
REDIS_PASSWORD=${REDIS_PASSWORD%.}
[ -n "$REDIS_PASSWORD" ] || { echo 'Redis password is empty' >&2; exit 1; }
export REDIS_PASSWORD
exec /redis_exporter
