#!/bin/sh
set -eu

MEILI_MASTER_KEY="$(cat /run/secrets/search-master-key)"
export MEILI_MASTER_KEY
exec /bin/meilisearch
