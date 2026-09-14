#!/bin/sh
set -eu
case "${ATHYPER_POOL_MODE:-}" in
  transaction) user=athyper_runtime ;;
  session) user=athyper_worker ;;
  *) exit 1 ;;
esac
export PGPASSFILE=/tmp/pgbouncer-health.pgpass PGCONNECT_TIMEOUT=2
# Outer deadline covers pool queueing as well as query execution. All three
# databases exist after db-init; no foundation tables are required.
for database in athyper_neon athyper_mesh athyper_studio; do
  timeout 3 psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 \
    -U "$user" -d "$database" -Atqc 'SELECT 1' >/dev/null
done
