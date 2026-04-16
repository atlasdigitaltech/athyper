-- ============================================================================
-- snapshot/05_functions.sql
-- Concept: Snapshot Logic — entity version compilation functions
-- Depends on: 04_tables/009_snapshot.sql, 04_tables/002_control.sql
-- ============================================================================

-- ─── C. Immutability guards for snapshot tables ──────────────────────────────

CREATE OR REPLACE FUNCTION snapshot.trg_compiled_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'snapshot.% is append-only. Create a new compiled snapshot instead.',
        TG_TABLE_NAME USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

COMMENT ON FUNCTION snapshot.trg_compiled_immutable() IS
    'Blocks UPDATE/DELETE on snapshot.entity_compiled and snapshot.entity_compiled_overlay. '
    'These tables are append-only — new compiled snapshots are created, never modified.';
