#!/bin/bash
# ========================================================
# athyper Stack – Database Initialization Script
# Creates all canonical databases with user grants.
# Idempotent: safe to re-run after partial failure or manual invocation.
#
# Frozen DB registry (all environments):
#   athyper_studio    — studio plane (dbpool_apps, transaction)
#   athyper_neon      — app runtime          (dbpool_apps, transaction)
#   athyper_mesh      — future collaboration (dbpool_apps, transaction)
#   athyper_iam       — Keycloak IAM         (dbpool_session, session)
#   athyper_health    — Healthchecks         (dbpool_apps, transaction)
#   athyper_errors    — GlitchTip            (dbpool_apps, transaction)
#   athyper_secrets   — Infisical            (dbpool_apps, transaction)
#   athyper_analytics — Metabase             (dbpool_session, session)
# ========================================================
set -e

runtime_user="${DBPOOL_APPS_USER:?DBPOOL_APPS_USER is required}"
runtime_password="${DBPOOL_APPS_PASSWORD:?DBPOOL_APPS_PASSWORD is required}"
if ! [[ "$runtime_user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "DBPOOL_APPS_USER must be a simple PostgreSQL identifier" >&2
    exit 1
fi
if [ "$runtime_user" = "$POSTGRES_USER" ]; then
    echo "DBPOOL_APPS_USER must not be the PostgreSQL administrator" >&2
    exit 1
fi

create_db_if_missing() {
    local db="$1"
    local description="$2"
    local exists
    exists=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")
    if [ "$exists" = "1" ]; then
        echo "=== Database $db already exists — skipping ($description) ==="
    else
        echo "=== Creating $db database ($description) ==="
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
            CREATE DATABASE "$db";
EOSQL
    fi
}

create_db_if_missing "athyper_studio"    "Athyper studio plane"
create_db_if_missing "athyper_mesh"      "future collaboration, product tier"
create_db_if_missing "athyper_iam"       "Keycloak IAM, session pool"
create_db_if_missing "athyper_health"    "Healthchecks, monitoring profile"
create_db_if_missing "athyper_errors"    "GlitchTip error tracking, monitoring profile"
create_db_if_missing "athyper_secrets"   "Infisical secrets vault, security-infisical profile"
create_db_if_missing "athyper_analytics" "Metabase BI, analytics profile"

echo "=== Provisioning least-privilege application login (idempotent) ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set=runtime_user="$runtime_user" --set=runtime_password="$runtime_password" <<-'EOSQL'
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
            CREATE ROLE athyperapp NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        END IF;
    END;
    $$;
    SELECT format(
        'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
        :'runtime_user', :'runtime_password'
    ) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_user') \gexec
    SELECT format(
        'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
        :'runtime_user', :'runtime_password'
    ) \gexec
    GRANT athyperapp TO :"runtime_user";
EOSQL

echo "=== Granting privileges (idempotent) ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE athyper_studio     TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_neon      TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_mesh      TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_iam       TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_health    TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_errors    TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_secrets   TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_analytics TO ${POSTGRES_USER};
EOSQL

echo "=== Database initialization complete ==="
echo "  - athyper_studio    (studio plane)"
echo "  - athyper_neon      (app runtime)"
echo "  - athyper_mesh      (future collaboration)"
echo "  - athyper_iam       (Keycloak IAM)"
echo "  - athyper_health    (Healthchecks)"
echo "  - athyper_errors    (GlitchTip)"
echo "  - athyper_secrets   (Infisical)"
echo "  - athyper_analytics (Metabase)"
