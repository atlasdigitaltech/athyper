/* ============================================================================
   Athyper — Lifecycle Hardening & Version Integrity
   Post-governed-versioning improvements:

   1. Lifecycle definition hash (cache invalidation)
   2. Version content hash (integrity verification)
   3. Revision reason enforcement for governed entities

   PostgreSQL 16+
   Depends on: 068_governed_versioning.sql
   ============================================================================ */

-- ============================================================================
-- 1. LIFECYCLE DEFINITION HASH (Cache Invalidation)
-- ============================================================================
-- Stores a content-addressable hash of the full lifecycle definition
-- (states, transitions, hooks). When definition changes, hash changes,
-- and consumers can detect staleness.

ALTER TABLE meta.lifecycle
    ADD COLUMN IF NOT EXISTS definition_hash text,
    ADD COLUMN IF NOT EXISTS updated_at      timestamptz;

COMMENT ON COLUMN meta.lifecycle.definition_hash IS
  'SHA-256 hash of the compiled lifecycle definition (states + transitions + hooks). NULL = never compiled.';
COMMENT ON COLUMN meta.lifecycle.updated_at IS
  'Last time this lifecycle or its children (states/transitions/hooks) were modified.';

-- Trigger: auto-update lifecycle.updated_at when states/transitions/hooks change
CREATE OR REPLACE FUNCTION meta.fn_lifecycle_child_changed()
RETURNS trigger AS $$
BEGIN
    -- Update the parent lifecycle's updated_at to signal staleness
    UPDATE meta.lifecycle
    SET updated_at = now(),
        definition_hash = NULL  -- NULL = stale, needs recomputation
    WHERE id = COALESCE(NEW.lifecycle_id, OLD.lifecycle_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- State changes
DROP TRIGGER IF EXISTS trg_lifecycle_state_changed ON meta.lifecycle_state;
CREATE TRIGGER trg_lifecycle_state_changed
    AFTER INSERT OR UPDATE OR DELETE ON meta.lifecycle_state
    FOR EACH ROW EXECUTE FUNCTION meta.fn_lifecycle_child_changed();

-- Transition changes
DROP TRIGGER IF EXISTS trg_lifecycle_transition_changed ON meta.lifecycle_transition;
CREATE TRIGGER trg_lifecycle_transition_changed
    AFTER INSERT OR UPDATE OR DELETE ON meta.lifecycle_transition
    FOR EACH ROW EXECUTE FUNCTION meta.fn_lifecycle_child_changed();

-- Hook changes (hooks reference transition_id, not lifecycle_id directly)
CREATE OR REPLACE FUNCTION meta.fn_lifecycle_hook_changed()
RETURNS trigger AS $$
DECLARE
    v_lifecycle_id uuid;
BEGIN
    SELECT lifecycle_id INTO v_lifecycle_id
    FROM meta.lifecycle_transition
    WHERE id = COALESCE(NEW.transition_id, OLD.transition_id);

    IF v_lifecycle_id IS NOT NULL THEN
        UPDATE meta.lifecycle
        SET updated_at = now(),
            definition_hash = NULL
        WHERE id = v_lifecycle_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lifecycle_hook_changed ON meta.lifecycle_transition_hook;
CREATE TRIGGER trg_lifecycle_hook_changed
    AFTER INSERT OR UPDATE OR DELETE ON meta.lifecycle_transition_hook
    FOR EACH ROW EXECUTE FUNCTION meta.fn_lifecycle_hook_changed();

-- ============================================================================
-- 2. VERSION CONTENT HASH (Integrity Verification)
-- ============================================================================
-- Content-addressable hash computed from fields + relations + indexes + policies.
-- Enables: change detection, quick equality comparison, cache validation.

ALTER TABLE meta.entity_version
    ADD COLUMN IF NOT EXISTS version_hash text;

COMMENT ON COLUMN meta.entity_version.version_hash IS
  'SHA-256 hash of version content (fields + relations + indexes + behaviors). Computed on save/publish.';

CREATE INDEX IF NOT EXISTS idx_ev_version_hash
    ON meta.entity_version (tenant_id, version_hash)
    WHERE version_hash IS NOT NULL;

-- ============================================================================
-- 3. REVISION REASON ENFORCEMENT (Governed Entities)
-- ============================================================================
-- For governed versioning, change_summary and change_type should be required
-- when creating new revisions. Enforcement is primarily in the service layer,
-- but we add a CHECK constraint as a safety net for direct SQL operations.
-- The constraint is conditional: only enforced when version_no > 1 (not v1 drafts).

ALTER TABLE meta.entity_version DROP CONSTRAINT IF EXISTS chk_ev_revision_reason;
ALTER TABLE meta.entity_version ADD CONSTRAINT chk_ev_revision_reason
    CHECK (
        -- v1 drafts don't need change reasons
        version_no <= 1
        -- Non-draft statuses that were created from revisions must have reasons
        OR change_type IS NOT NULL
        -- Drafts can be saved without reasons initially (enforced on submit/publish)
        OR status = 'draft'
    );

COMMENT ON CONSTRAINT chk_ev_revision_reason ON meta.entity_version IS
  'Ensures change_type is set for non-draft versions beyond v1. Service layer enforces stricter rules for governed entities.';
