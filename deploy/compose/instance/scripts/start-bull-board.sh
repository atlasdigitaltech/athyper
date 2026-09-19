#!/bin/sh
set -eu

REDIS_PASSWORD="$(cat /run/secrets/redis-password)"
export REDIS_PASSWORD
exec "$@"
