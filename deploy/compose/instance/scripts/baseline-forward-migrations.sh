#!/bin/sh
set -eu

MIGRATION_ROOT=${ATHYPER_MIGRATION_ROOT:-/app/migrations}
PASSWORD_FILE=${ATHYPER_POSTGRES_PASSWORD_FILE:-/run/secrets/postgres-password}
BASELINE_ID="baseline-$(date -u +%Y%m%dT%H%M%SZ)"

fail() {
  printf '%s\n' "migration baseline: $*" >&2
  exit 1
}

case "${ATHYPER_DDL_SHA256:-}" in
  ''|*[!0-9a-f]*) fail "ATHYPER_DDL_SHA256 is invalid" ;;
  *) [ "${#ATHYPER_DDL_SHA256}" -eq 64 ] || fail "ATHYPER_DDL_SHA256 must contain 64 hexadecimal characters" ;;
esac
[ -r "$PASSWORD_FILE" ] || fail "Postgres password file is unavailable"
[ -d "$MIGRATION_ROOT" ] || fail "migration directory is unavailable: $MIGRATION_ROOT"
command -v psql >/dev/null 2>&1 || fail "psql is unavailable"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is unavailable"

export PGPASSWORD
PGPASSWORD=$(sed -n '1p' "$PASSWORD_FILE")
[ -n "$PGPASSWORD" ] || fail "Postgres password is empty"

run_sql() {
  database=$1
  shift
  psql --host "${PGHOST:-db}" --port "${PGPORT:-5432}" --username "${PGUSER:-postgres}" \
    --dbname "$database" --no-psqlrc --set ON_ERROR_STOP=1 --quiet "$@"
}

# Baseline only after a current, checksum-matched foundation. Never adopt an
# existing ledger because that could conceal a failed or partially run change.
for plane in studio neon mesh; do
  database="athyper_$plane"
  manifest="$MIGRATION_ROOT/manifests/$plane.txt"
  [ -r "$manifest" ] || fail "manifest is unavailable: $manifest"

  foundation=$(run_sql "$database" --tuples-only --no-align \
    --set "plane=$plane" <<'SQL'
SELECT ddl_sha256
  FROM public.athyper_foundation_receipt_v1
 WHERE plane = :'plane';
SQL
  )
  [ "$foundation" = "$ATHYPER_DDL_SHA256" ] \
    || fail "$database foundation receipt does not match the approved DDL"

  ledger=$(run_sql "$database" --tuples-only --no-align <<'SQL'
SELECT to_regclass('public.athyper_schema_migration_v1') IS NOT NULL;
SQL
  )
  [ "$ledger" = f ] || fail "$database already has a migration ledger; refusing baseline adoption"

  run_sql "$database" <<'SQL'
CREATE TABLE public.athyper_schema_migration_v1 (
  migration_name text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('applying', 'applied', 'failed')),
  runner_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  failure_message text
);
REVOKE ALL ON public.athyper_schema_migration_v1 FROM PUBLIC;
SQL

  while IFS= read -r name || [ -n "$name" ]; do
    case "$name" in ''|'#'*) continue ;; esac
    case "$name" in *[!A-Za-z0-9_.-]*) fail "unsafe migration name in $manifest: $name" ;; esac
    file="$MIGRATION_ROOT/$name"
    [ -f "$file" ] || fail "migration is absent: $file"
    checksum=$(sha256sum "$file" | cut -d ' ' -f 1)
    run_sql "$database" --set "migration=$name" --set "checksum=$checksum" --set "runner=$BASELINE_ID" <<'SQL'
INSERT INTO public.athyper_schema_migration_v1(
  migration_name, sha256, status, runner_id, completed_at
) VALUES (:'migration', :'checksum', 'applied', :'runner', clock_timestamp());
SQL
  done < "$manifest"
  printf '%s\n' "migration baseline: recorded image-contained migrations for $database"
done

printf '%s\n' "migration baseline: all plane manifests are baselined"
