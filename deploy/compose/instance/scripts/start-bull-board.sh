#!/bin/sh
set -eu

REDIS_PASSWORD="$(cat /run/secrets/jobs-redis-password)"
export REDIS_PASSWORD
exec "$@"
