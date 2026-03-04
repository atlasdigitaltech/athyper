#!/bin/bash
# ========================================================
# athyper Mesh – Database Initialization Script
# Creates application and IAM databases with user grants
# ========================================================
set -e

echo "=== Creating athyperauth_dev1 database ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE athyperauth_dev1;
EOSQL

echo "=== Granting privileges ==="
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE athyper_dev1 TO athyperadmin;
    GRANT ALL PRIVILEGES ON DATABASE athyperauth_dev1 TO athyperadmin;
EOSQL

echo "=== Database initialization complete ==="
echo "  - athyper_dev1 (application database)"
echo "  - athyperauth_dev1 (IAM/Keycloak database)"
