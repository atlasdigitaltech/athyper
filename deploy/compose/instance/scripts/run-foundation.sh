#!/bin/sh
set -eu

export PGPASSWORD="$(cat /run/secrets/postgres-password)"
ddl_root=/athyper/ddl

apply_plane() {
  plane="$1"
  database="athyper_${plane}"
  manifest="${ddl_root}/planes/${plane}/_manifest.txt"

  case "${ATHYPER_DDL_SHA256:-}" in
    ''|*[!0-9a-f]*) echo "ATHYPER_DDL_SHA256 is invalid" >&2; exit 1 ;;
    *) ;;
  esac
  if [ "${#ATHYPER_DDL_SHA256}" -ne 64 ]; then
    echo "ATHYPER_DDL_SHA256 must contain 64 hexadecimal characters" >&2
    exit 1
  fi

  blockers="$(psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
    --dbname "$database" --command "
      WITH blockers AS (
        SELECT 1
          FROM pg_namespace
         WHERE nspname <> 'public'
           AND nspname <> 'information_schema'
           AND nspname !~ '^pg_'
        UNION ALL
        SELECT 1
          FROM pg_class AS c
          JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r','p','v','m','S','f')
           AND n.nspname <> 'information_schema'
           AND n.nspname !~ '^pg_'
      ) SELECT count(*) FROM blockers;
    " | tr -d '[:space:]')"
  if [ "$blockers" != "0" ]; then
    receipt_table="$(psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
      --dbname "$database" --command "SELECT to_regclass('public.athyper_foundation_receipt_v1') IS NOT NULL" | tr -d '[:space:]')"
    applied=""
    if [ "$receipt_table" = "t" ]; then
      applied="$(psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 \
        --dbname "$database" --command "SELECT ddl_sha256 FROM public.athyper_foundation_receipt_v1 WHERE plane = '${plane}'" | tr -d '[:space:]')"
    fi
    if [ "$applied" = "$ATHYPER_DDL_SHA256" ]; then
      echo "foundation already applied with matching checksum: ${database}"
      return
    fi
    echo "refusing foundation build: ${database} is not empty (${blockers} relation blockers)" >&2
    exit 1
  fi

  transaction="/tmp/athyper-foundation-${plane}.sql"
  {
    echo "BEGIN;"
    echo "SELECT pg_advisory_xact_lock(hashtextextended('athyper-foundation:${database}', 0));"
    echo "SELECT set_config('app.database_plane', '${plane}', false);"
    echo "SELECT set_config('app.current_principal_id', '00000000-0000-0000-0000-000000000000', false);"
    while IFS= read -r source || [ -n "$source" ]; do
      source="$(printf '%s' "$source" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      case "$source" in
        ""|'#'*) continue ;;
        /*|*..*|*[!A-Za-z0-9_./-]*)
          echo "invalid DDL manifest path: ${source}" >&2
          exit 1
          ;;
      esac
      if [ ! -f "${ddl_root}/${source}" ]; then
        echo "DDL manifest entry is absent: ${source}" >&2
        exit 1
      fi
      printf '\\ir %s\n' "${ddl_root}/${source}"
    done < "$manifest"
    echo "CREATE TABLE public.athyper_foundation_receipt_v1 (plane text PRIMARY KEY, ddl_sha256 text NOT NULL CHECK (ddl_sha256 ~ '^[0-9a-f]{64}$'), completed_at timestamptz NOT NULL DEFAULT now());"
    echo "INSERT INTO public.athyper_foundation_receipt_v1 (plane, ddl_sha256) VALUES ('${plane}', '${ATHYPER_DDL_SHA256}');"
    echo "REVOKE ALL ON public.athyper_foundation_receipt_v1 FROM PUBLIC;"
    echo "COMMIT;"
  } > "$transaction"

  psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname "$database" --file "$transaction"
  rm -f "$transaction"
}

apply_plane studio
apply_plane neon
apply_plane mesh

# The foundation manifests create the cluster-scoped NOLOGIN roles. Grant
# membership only after every plane transaction succeeds so login identities
# can never inherit a partially built privilege contract.
psql --no-psqlrc --set ON_ERROR_STOP=1 --dbname postgres <<'SQL'
GRANT athyperapp TO athyper_runtime;
GRANT athyper_trustiam_service TO athyper_runtime;
GRANT athyper_jobs_service TO athyper_worker;
SQL

# Reconcile the narrow worker contract independently from the immutable
# foundation checksum. This runs for both freshly built and existing matching
# foundations, so operational grants can be repaired without pretending that
# the original foundation transaction was replayed.
for plane in studio neon mesh; do
  psql --no-psqlrc --set ON_ERROR_STOP=1 \
    --dbname "athyper_${plane}" \
    --file /athyper/reconciliation/runtime-worker-grants-v1.sql
done

unset PGPASSWORD
