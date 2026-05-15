-- ============================================================================
-- public/01_tables.sql
-- Concept: Public Schema — schema_provisions metadata sentinel
-- Depends on: 01_schemas/001_schemas.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schema_provisions (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_name       text        NOT NULL UNIQUE,
    checksum        text        NOT NULL,
    executed_at     timestamptz NOT NULL DEFAULT now()
);
