#!/bin/sh
set -eu

WEED_ADMIN_PASSWORD="$(cat /run/secrets/storage-console-password)"
if [ -z "$WEED_ADMIN_PASSWORD" ]; then
  echo "Storage console password must not be empty" >&2
  exit 1
fi
export WEED_ADMIN_PASSWORD
export WEED_ADMIN_USER=admin
cd /tmp
exec /usr/bin/weed admin -ip=0.0.0.0 -port=23646 \
  -master=127.0.0.1:9333 -urlPrefix=/console \
  -dataDir=/tmp/admin -iceberg.port=0 -lance.port=0
