-- ============================================================================
-- mesh_log/05_functions.sql
-- Mesh log helper functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION mesh_log.trg_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = mesh_log, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION '% on %.% is not allowed; Mesh log rows are append-only',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION mesh_log.trg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = mesh_log, pg_catalog
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mesh_log.trg_prevent_mutation IS
    'Blocks UPDATE/DELETE on immutable Mesh log tables.';
COMMENT ON FUNCTION mesh_log.trg_set_updated_at IS
    'Sets updated_at for low-volume mutable operational log tables such as mesh_log.dlq.';
