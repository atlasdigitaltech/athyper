-- 01_schemas/002_int_schema.sql
-- Integration hub schema.
-- Depends on: 01_schemas/001_schemas.sql

CREATE SCHEMA IF NOT EXISTS int;

COMMENT ON SCHEMA int IS
    'Integration hub: endpoint registry, outbound connection config, and '
    'webhook subscription management. Event processing uses event.outbox.';
