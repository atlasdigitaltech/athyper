/* ============================================================================
   Athyper — Entity Registry Lifecycle
   Replaces the boolean is_active flag with a richer 5-state status model
   for the entity registry itself (meta.entity).

   States:
     draft      — entity definition in progress, not yet usable
     active     — live and operational
     deprecated — still usable but flagged for phase-out
     suspended  — temporarily disabled (e.g., compliance hold)
     retired    — permanently decommissioned, no data operations

   Backward compatibility:
     is_active is redefined as a GENERATED column:
       status IN ('active', 'deprecated', 'suspended') → true
       status IN ('draft', 'retired')                   → false

   Transition rules (enforced at application level):
     draft      → active
     active     → deprecated, suspended, retired
     deprecated → active, retired
     suspended  → active, retired
     retired    → (terminal, no transitions out)

   PostgreSQL 16+
   Depends on: 040_meta.sql (meta.entity base table)
   ============================================================================ */

-- ============================================================================
-- 1. STATUS COLUMN
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS status text;

-- Backfill: all existing entities get status derived from current is_active
UPDATE meta.entity SET status = CASE WHEN is_active THEN 'active' ELSE 'retired' END
WHERE status IS NULL;

-- Now make it NOT NULL with default
ALTER TABLE meta.entity ALTER COLUMN status SET NOT NULL;
ALTER TABLE meta.entity ALTER COLUMN status SET DEFAULT 'draft';

-- Check constraint
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_status;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_status
    CHECK (status IN ('draft', 'active', 'deprecated', 'suspended', 'retired'));

COMMENT ON COLUMN meta.entity.status IS
  'Entity registry lifecycle status: draft (WIP), active (live), deprecated (phase-out), suspended (temp hold), retired (decommissioned).';

-- ============================================================================
-- 2. REDEFINE is_active AS GENERATED COLUMN (backward compatibility)
-- ============================================================================
-- PostgreSQL does not allow ALTER COLUMN ... SET GENERATED on an existing column.
-- We must drop and re-add it.

-- Drop dependent indexes that reference is_active
DROP INDEX IF EXISTS idx_entity_table_mapping_uniq;

-- Drop the old column and re-create as generated
ALTER TABLE meta.entity DROP COLUMN IF EXISTS is_active;
ALTER TABLE meta.entity ADD COLUMN is_active boolean
    GENERATED ALWAYS AS (status IN ('active', 'deprecated', 'suspended')) STORED;

COMMENT ON COLUMN meta.entity.is_active IS
  'Generated backward-compat flag: true when status is active, deprecated, or suspended.';

-- Recreate the physical mapping uniqueness index (was on is_active + mapping_mode)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_table_mapping_uniq
    ON meta.entity (tenant_id, table_schema, table_name)
    WHERE is_active = true AND mapping_mode = 'exclusive';

-- ============================================================================
-- 3. STATUS AUDIT COLUMNS
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS status_changed_by text;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS status_reason text;

COMMENT ON COLUMN meta.entity.status_changed_at IS
  'Timestamp of the most recent status transition.';
COMMENT ON COLUMN meta.entity.status_changed_by IS
  'Principal who performed the most recent status transition.';
COMMENT ON COLUMN meta.entity.status_reason IS
  'Free-text reason for the most recent status transition (e.g., "compliance review", "replaced by v2").';

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- Primary status filter index
CREATE INDEX IF NOT EXISTS idx_entity_status
    ON meta.entity (tenant_id, status);

-- Partial index for active entities (most common query path)
CREATE INDEX IF NOT EXISTS idx_entity_active
    ON meta.entity (tenant_id, name)
    WHERE status IN ('active', 'deprecated', 'suspended');

-- ============================================================================
-- 5. UPDATE TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE meta.entity IS
  'Entity (DocType) registry. Identity: entity_code (immutable), name (display), slug (routing), entity_short (alias). Classification: kind (domain) + entity_class (behavior). Lifecycle: status (draft/active/deprecated/suspended/retired). Physical mapping, governance, feature flags, version links.';
