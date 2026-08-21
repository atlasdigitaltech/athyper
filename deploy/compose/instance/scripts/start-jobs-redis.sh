#!/bin/sh
set -eu

password="$(cat /run/secrets/jobs-redis-password)"
exec redis-server --appendonly yes --appendfsync everysec --requirepass "$password"
