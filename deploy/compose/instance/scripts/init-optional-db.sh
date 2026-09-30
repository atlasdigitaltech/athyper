#!/usr/bin/env bash
set -Eeuo pipefail

: "${ATHYPER_DB_ROLE:?set ATHYPER_DB_ROLE}"
: "${ATHYPER_DB_NAME:?set ATHYPER_DB_NAME}"
: "${ATHYPER_PASSWORD_SECRET:?set ATHYPER_PASSWORD_SECRET}"
[[ "$ATHYPER_DB_ROLE" =~ ^[a-z][a-z0-9_]+$ ]]
[[ "$ATHYPER_DB_NAME" =~ ^[a-z][a-z0-9_]+$ ]]

PGPASSWORD="$(< /run/secrets/postgres-password)"
role_password="$(< "/run/secrets/${ATHYPER_PASSWORD_SECRET}")"
export PGPASSWORD

psql --set=ON_ERROR_STOP=1 \
  --set=db_role="$ATHYPER_DB_ROLE" \
  --set=db_name="$ATHYPER_DB_NAME" \
  --set=role_password="$role_password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'db_role')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_role')\gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'db_role', :'role_password')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name')\gexec
SQL

unset role_password PGPASSWORD
