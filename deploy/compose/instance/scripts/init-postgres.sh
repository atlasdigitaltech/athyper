#!/usr/bin/env bash
set -Eeuo pipefail

PGPASSWORD="$(< /run/secrets/postgres-password)"
export PGPASSWORD
iam_password="$(< /run/secrets/iam-db-password)"
runtime_password="$(< /run/secrets/runtime-db-password)"
worker_password="$(< /run/secrets/worker-db-password)"

psql --set=ON_ERROR_STOP=1 \
  --set=iam_password="$iam_password" \
  --set=runtime_password="$runtime_password" \
  --set=worker_password="$worker_password" <<'SQL'
SELECT 'CREATE ROLE athyperadmin NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'athyperadmin')\gexec
SELECT 'CREATE ROLE athyper_iam LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'athyper_iam')\gexec
ALTER ROLE athyper_iam PASSWORD :'iam_password';
SELECT 'CREATE ROLE athyper_runtime LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'athyper_runtime')\gexec
ALTER ROLE athyper_runtime PASSWORD :'runtime_password';
SELECT 'CREATE ROLE athyper_worker LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'athyper_worker')\gexec
ALTER ROLE athyper_worker PASSWORD :'worker_password';
GRANT athyperapp TO athyper_runtime;
GRANT athyper_jobs_service TO athyper_worker;
SELECT 'CREATE DATABASE athyper_iam OWNER athyper_iam'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'athyper_iam')\gexec
SELECT 'CREATE DATABASE athyper_neon OWNER athyper_runtime'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'athyper_neon')\gexec
SELECT 'CREATE DATABASE athyper_mesh OWNER athyper_runtime'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'athyper_mesh')\gexec
SELECT 'CREATE DATABASE athyper_studio OWNER athyper_runtime'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'athyper_studio')\gexec
REVOKE ALL ON DATABASE athyper_iam FROM PUBLIC;
REVOKE ALL ON DATABASE athyper_neon FROM PUBLIC;
REVOKE ALL ON DATABASE athyper_mesh FROM PUBLIC;
REVOKE ALL ON DATABASE athyper_studio FROM PUBLIC;
GRANT CONNECT ON DATABASE athyper_neon TO athyper_worker;
GRANT CONNECT ON DATABASE athyper_mesh TO athyper_worker;
GRANT CONNECT ON DATABASE athyper_studio TO athyper_worker;
SQL

for database in athyper_neon athyper_mesh athyper_studio; do
  psql --set=ON_ERROR_STOP=1 --dbname="$database" <<'SQL'
GRANT USAGE ON SCHEMA public TO athyper_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO athyper_worker;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO athyper_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE athyper_runtime IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO athyper_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE athyper_runtime IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO athyper_worker;
SQL
done

unset iam_password runtime_password worker_password PGPASSWORD
