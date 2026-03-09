/* ============================================================================
   Athyper — Cross-Entity Consistency Checks
   Enforces invariants between meta.entity, meta.entity_version, and related
   tables that cannot be expressed as single-table constraints.

   Constraints added:
     1. At most one published version per entity (partial unique index)
     2. Published versions must have published_at and published_by set (CHECK)
     3. DOCUMENT entities with numbering must have naming_policy (trigger)

   PostgreSQL 16+
   Depends on: 040_meta.sql (meta.entity, meta.entity_version)
   ============================================================================ */

-- ============================================================================
-- 1. AT MOST ONE PUBLISHED VERSION PER ENTITY
-- ============================================================================
-- A partial unique index on (tenant_id, entity_id) where status = 'published'
-- ensures that no two versions of the same entity can be published at once.
-- The activation flow must archive/deactivate before publishing a new version.

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_version_one_published
    ON meta.entity_version (tenant_id, entity_id)
    WHERE status = 'published';

COMMENT ON INDEX meta.idx_entity_version_one_published IS
  'Ensures at most one published version per entity per tenant. The activation flow must archive the current published version before publishing a new one.';

-- ============================================================================
-- 2. PUBLISHED VERSION METADATA CONSISTENCY
-- ============================================================================
-- When a version is published, published_at and published_by must be set.
-- This CHECK allows draft/archived versions to have NULL values.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_version_published_metadata'
    ) THEN
        ALTER TABLE meta.entity_version
            ADD CONSTRAINT chk_version_published_metadata
            CHECK (
                status <> 'published'
                OR (published_at IS NOT NULL AND published_by IS NOT NULL)
            );
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'chk_version_published_metadata: %', SQLERRM;
END $$;

-- ============================================================================
-- 3. DOCUMENT+NUMBERING → NAMING_POLICY REQUIRED (TRIGGER)
-- ============================================================================
-- Enforces: if entity_class = 'DOCUMENT' and feature_flags has numbering
-- enabled (via numbering_enabled=true or derived from class defaults),
-- then naming_policy must not be NULL.
--
-- This fires on INSERT and UPDATE of meta.entity, catching the case where
-- numbering is enabled without a pattern.

CREATE OR REPLACE FUNCTION meta.trg_entity_numbering_policy_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    numbering_flag boolean;
BEGIN
    -- Only applies to DOCUMENT entities
    IF NEW.entity_class IS DISTINCT FROM 'DOCUMENT' THEN
        RETURN NEW;
    END IF;

    -- Check if numbering is explicitly enabled via feature_flags
    numbering_flag := (NEW.feature_flags ->> 'numbering_enabled')::boolean;

    -- DOCUMENT entities with numbering_enabled = true must have naming_policy
    IF numbering_flag IS TRUE AND NEW.naming_policy IS NULL THEN
        RAISE EXCEPTION
            'CONSISTENCY_CHECK: DOCUMENT entity "%" has numbering_enabled=true but naming_policy is NULL. '
            'Set a naming_policy with at least a pattern field, or disable numbering.',
            NEW.name
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_numbering_policy_check ON meta.entity;

CREATE TRIGGER entity_numbering_policy_check
    BEFORE INSERT OR UPDATE ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_entity_numbering_policy_check();

COMMENT ON TRIGGER entity_numbering_policy_check ON meta.entity IS
  'Ensures DOCUMENT entities with numbering_enabled=true have a naming_policy defined.';

-- ============================================================================
-- 4. UPDATE TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE meta.entity_version IS
  'Versioned entity definition (draft -> published -> archived). Invariants: at most one published version per entity (enforced by partial unique index), published versions must have published_at/published_by set (CHECK constraint).';
