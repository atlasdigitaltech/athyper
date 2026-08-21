#!/bin/sh
set -eu

db_password="$(cat /run/secrets/runtime-db-password)"
exec /usr/bin/pgweb --bind=0.0.0.0 --listen=8081 \
  --url="postgres://athyper_runtime:${db_password}@dbpool-session:5432/athyper_neon?sslmode=disable"
