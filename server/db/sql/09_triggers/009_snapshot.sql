
-- ─── D. Immutability guards for snapshot tables ──────────────────────────────

DROP TRIGGER IF EXISTS trg_ec_immutable ON snapshot.entity_compiled;
CREATE TRIGGER trg_ec_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_compiled
    FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();

DROP TRIGGER IF EXISTS trg_eco_immutable ON snapshot.entity_compiled_overlay;
CREATE TRIGGER trg_eco_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_compiled_overlay
    FOR EACH ROW EXECUTE FUNCTION snapshot.trg_compiled_immutable();


-- =============================================================================
-- §6  DOCUMENT · PRINT · BRANDING  —  snapshot triggers
-- =============================================================================

-- ── Immutability guard function ────────────────────────────────────────────
-- Blocks all UPDATE and DELETE on snapshot.template_version.
-- Follows the same pattern as snapshot.trg_lifecycle_version_immutable
-- and snapshot.trg_compiled_immutable.

CREATE OR REPLACE FUNCTION snapshot.trg_template_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = snapshot, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION
        'snapshot.template_version is append-only. '
        'UPDATE and DELETE are not permitted. '
        'Publish a new version instead.'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

COMMENT ON FUNCTION snapshot.trg_template_version_immutable() IS
    'Immutability guard for snapshot.template_version. '
    'Fires BEFORE UPDATE OR DELETE — raises exception unconditionally. '
    'Follows pattern of snapshot.trg_lifecycle_version_immutable.';

-- ── Immutability trigger ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_template_version_immutable ON snapshot.template_version;
CREATE TRIGGER trg_template_version_immutable
    BEFORE UPDATE OR DELETE ON snapshot.template_version
    FOR EACH ROW EXECUTE FUNCTION snapshot.trg_template_version_immutable();

-- ── variables_schema JSONB validator ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_template_version_validate_variables ON snapshot.template_version;
CREATE TRIGGER trg_template_version_validate_variables
    BEFORE INSERT OR UPDATE OF variables_schema
    ON snapshot.template_version
    FOR EACH ROW EXECUTE FUNCTION document.trg_validate_variables_schema();
