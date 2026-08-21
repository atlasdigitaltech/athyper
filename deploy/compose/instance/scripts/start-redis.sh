#!/bin/sh
set -eu

password="$(cat /run/secrets/redis-password)"
exec redis-server --appendonly yes --appendfsync everysec --requirepass "$password"
