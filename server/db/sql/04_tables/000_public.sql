-- 04_tables/000_public.sql
-- Provisioning tracker — records which SQL files have been applied and their checksums.

CREATE TABLE IF NOT EXISTS public.schema_provisions (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name       text        NOT NULL UNIQUE,
    checksum        text        NOT NULL,
    executed_at     timestamptz NOT NULL DEFAULT now()
);
