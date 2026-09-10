#!/bin/sh
set -eu

MIGRATION_ROOT=${ATHYPER_MIGRATION_ROOT:-/app/migrations}
PASSWORD_FILE=${ATHYPER_POSTGRES_PASSWORD_FILE:-/run/secrets/postgres-password}

fail() {
  printf '%s\n' "forward migration: $*" >&2
  exit 1
}

[ -r "$PASSWORD_FILE" ] || fail "Postgres password file is unavailable"
[ -d "$MIGRATION_ROOT" ] || fail "migration directory is unavailable: $MIGRATION_ROOT"
command -v psql >/dev/null 2>&1 || fail "psql is unavailable"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is unavailable"

# Container PID namespaces commonly reuse PID 1. Time plus PID is not unique
# across simultaneous deployment containers claiming the same migration ledger.
RUNNER_ID=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
[ "${#RUNNER_ID}" -eq 32 ] || fail "cannot generate a migration runner identity"

export PGPASSWORD
PGPASSWORD=$(sed -n '1p' "$PASSWORD_FILE")
[ -n "$PGPASSWORD" ] || fail "Postgres password is empty"

run_sql() {
  database=$1
  shift
  psql --host "${PGHOST:-db}" --port "${PGPORT:-5432}" --username "${PGUSER:-postgres}" \
    --dbname "$database" --no-psqlrc --set ON_ERROR_STOP=1 --quiet "$@"
}

for plane in studio neon mesh; do
  database="athyper_$plane"
  manifest="$MIGRATION_ROOT/manifests/$plane.txt"
  [ -r "$manifest" ] || fail "manifest is unavailable: $manifest"

  run_sql "$database" <<'SQL'
CREATE TABLE IF NOT EXISTS public.athyper_schema_migration_v1 (
  migration_name text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('applying', 'applied', 'failed')),
  runner_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  failure_message text
);
SQL

  while IFS= read -r name || [ -n "$name" ]; do
    case "$name" in
      ''|'#'*) continue ;;
    esac
    case "$name" in
      *[!A-Za-z0-9_.-]*) fail "unsafe migration name in $manifest: $name" ;;
    esac
    file="$MIGRATION_ROOT/$name"
    [ -f "$file" ] || fail "migration is absent: $file"
    checksum=$(sha256sum "$file" | cut -d ' ' -f 1)

    state=$(run_sql "$database" --tuples-only --no-align \
      --set "migration=$name" --set "checksum=$checksum" --set "runner=$RUNNER_ID" <<'SQL'
INSERT INTO public.athyper_schema_migration_v1(migration_name, sha256, status, runner_id)
VALUES (:'migration', :'checksum', 'applying', :'runner')
ON CONFLICT (migration_name) DO NOTHING;
SELECT status || '|' || sha256 || '|' || runner_id
  FROM public.athyper_schema_migration_v1
 WHERE migration_name = :'migration';
SQL
    )
    status=${state%%|*}
    rest=${state#*|}
    recorded_checksum=${rest%%|*}
    recorded_runner=${rest#*|}
    [ "$recorded_checksum" = "$checksum" ] || fail "$database/$name checksum differs from the migration ledger"
    if [ "$status" = applied ]; then
      printf '%s\n' "forward migration: $database/$name already applied"
      continue
    fi
    [ "$status" = applying ] && [ "$recorded_runner" = "$RUNNER_ID" ] \
      || fail "$database/$name is $status under runner $recorded_runner; operator resolution is required"

    if run_sql "$database" --file "$file"; then
      run_sql "$database" --set "migration=$name" --set "runner=$RUNNER_ID" <<'SQL'
UPDATE public.athyper_schema_migration_v1
   SET status = 'applied', completed_at = clock_timestamp(), failure_message = NULL
 WHERE migration_name = :'migration' AND runner_id = :'runner' AND status = 'applying';
SQL
      printf '%s\n' "forward migration: applied $database/$name"
    else
      run_sql "$database" --set "migration=$name" --set "runner=$RUNNER_ID" <<'SQL' || true
UPDATE public.athyper_schema_migration_v1
   SET status = 'failed', completed_at = clock_timestamp(), failure_message = 'psql returned a non-zero status'
 WHERE migration_name = :'migration' AND runner_id = :'runner' AND status = 'applying';
SQL
      fail "$database/$name failed; the ledger is locked for operator review"
    fi
  done < "$manifest"
done

printf '%s\n' "forward migration: all plane manifests are applied"
