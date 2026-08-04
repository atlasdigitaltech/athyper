#!/bin/bash
# ========================================================
# athyper Stack – Database Initialization Script
# Creates all canonical databases with user grants.
# Idempotent: safe to re-run after partial failure or manual invocation.
#
# Frozen DB registry (all environments):
#   athyper_platform  — platform/control plane (dbpool_apps, transaction)
#   athyper_neon      — app runtime          (dbpool_apps, transaction)
#   athyper_mesh      — future collaboration (dbpool_apps, transaction)
#   athyper_iam       — Keycloak IAM         (dbpool_session, session)
#   athyper_health    — Healthchecks         (dbpool_apps, transaction)
#   athyper_errors    — GlitchTip            (dbpool_apps, transaction)
#   athyper_secrets   — Infisical            (dbpool_apps, transaction)
#   athyper_analytics — Metabase             (dbpool_session, session)
# ========================================================
set -e

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

create_db_if_missing "athyper_platform"  "Athyper platform and control plane"
create_db_if_missing "athyper_mesh"      "future collaboration, product tier"
create_db_if_missing "athyper_iam"       "Keycloak IAM, session pool"
create_db_if_missing "athyper_health"    "Healthchecks, monitoring profile"
create_db_if_missing "athyper_errors"    "GlitchTip error tracking, monitoring profile"
create_db_if_missing "athyper_secrets"   "Infisical secrets vault, security-infisical profile"
create_db_if_missing "athyper_analytics" "Metabase BI, analytics profile"

echo "=== Granting privileges (idempotent) ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE athyper_platform  TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_neon      TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_mesh      TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_iam       TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_health    TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_errors    TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_secrets   TO ${POSTGRES_USER};
    GRANT ALL PRIVILEGES ON DATABASE athyper_analytics TO ${POSTGRES_USER};
EOSQL

echo "=== Database initialization complete ==="
echo "  - athyper_platform  (platform/control plane)"
echo "  - athyper_neon      (app runtime)"
echo "  - athyper_mesh      (future collaboration)"
echo "  - athyper_iam       (Keycloak IAM)"
echo "  - athyper_health    (Healthchecks)"
echo "  - athyper_errors    (GlitchTip)"
echo "  - athyper_secrets   (Infisical)"
echo "  - athyper_analytics (Metabase)"
