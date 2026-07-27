-- ============================================================================
-- Meta Entity Contract M2: v2.1 deterministic projection state.
-- ============================================================================

ALTER TABLE control.entity_version
    ADD COLUMN IF NOT EXISTS projection_hash text,
    ADD COLUMN IF NOT EXISTS projected_at timestamptz,
    ADD COLUMN IF NOT EXISTS projected_by uuid;

COMMENT ON COLUMN control.entity_version.projection_hash IS
    'Canonical Contract v2.1 hash most recently projected transactionally into version-owned control tables.';

