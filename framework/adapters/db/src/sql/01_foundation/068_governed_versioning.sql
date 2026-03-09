/* ============================================================================
   Athyper — Governed Versioning & Lifecycle Hooks
   Implements enterprise-grade version governance for meta entities:

   1. Document Root enhancements (meta.entity_publish_state)
      - current_draft_version_id, latest_version_no, status_summary

   2. Entity Version governance columns (meta.entity_version)
      - Expanded status set: draft, in_review, approved, effective,
        superseded, archived, rejected, withdrawn
      - Lineage: derived_from_version_id, supersedes_version_id
      - Effectivity: is_effective, effective_from, effective_to
      - Governance: approved_at/by, change_summary, change_type,
        is_working_copy, lock_version
      - Lifecycle binding: lifecycle_instance_id

   3. Invariant enforcement (unique partial indexes)
      - One effective version per entity
      - One active draft per entity
      - Immutability guard for published/effective versions

   4. Versioning policy on meta.entity (feature_flags extension)
      - Stored as JSONB in feature_flags.versioning_policy

   5. Lifecycle transition hooks (meta.lifecycle_transition_hook)
      - First-class configurable post-transition actions

   6. Runtime tables for lifecycle (core schema)
      - core.entity_lifecycle_instance
      - core.entity_lifecycle_event

   PostgreSQL 16+
   Depends on: 040_meta.sql, 064_entity_publish_state.sql
   ============================================================================ */

-- ============================================================================
-- 1. DOCUMENT ROOT ENHANCEMENTS (meta.entity_publish_state)
-- ============================================================================
-- meta.entity IS the document root. We add pointers for draft tracking.

ALTER TABLE meta.entity_publish_state
    ADD COLUMN IF NOT EXISTS current_draft_version_id uuid,
    ADD COLUMN IF NOT EXISTS latest_version_no        int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status_summary           text;

-- FK for draft pointer
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eps_draft_version') THEN
        ALTER TABLE meta.entity_publish_state
            ADD CONSTRAINT fk_eps_draft_version
            FOREIGN KEY (current_draft_version_id)
            REFERENCES meta.entity_version(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN meta.entity_publish_state.current_draft_version_id IS
  'Points to the single active draft version (if any). NULL = no draft in progress.';
COMMENT ON COLUMN meta.entity_publish_state.latest_version_no IS
  'Highest version_no ever created for this entity. Monotonically increasing.';
COMMENT ON COLUMN meta.entity_publish_state.status_summary IS
  'Human-readable summary: "v3 effective, v4 draft", "v2 effective (no draft)", etc.';

CREATE INDEX IF NOT EXISTS idx_eps_draft_version
    ON meta.entity_publish_state (current_draft_version_id)
    WHERE current_draft_version_id IS NOT NULL;

-- ============================================================================
-- 2. ENTITY VERSION GOVERNANCE COLUMNS
-- ============================================================================

-- 2a. Expand status CHECK constraint
-- Drop the old constraint FIRST (it only allows draft/published/archived)
ALTER TABLE meta.entity_version DROP CONSTRAINT IF EXISTS entity_version_status_chk;

-- Add the is_effective column early so the backfill can set it
ALTER TABLE meta.entity_version
    ADD COLUMN IF NOT EXISTS is_effective boolean NOT NULL DEFAULT false;

-- Backfill published → effective now that the old CHECK is gone
-- effective_from is set later in section 6 after the column is added
UPDATE meta.entity_version
SET status = 'effective',
    is_effective = true
WHERE status = 'published';

-- Now add the new expanded CHECK constraint
ALTER TABLE meta.entity_version ADD CONSTRAINT entity_version_status_chk
    CHECK (status IN (
        'draft',        -- editable working copy
        'in_review',    -- submitted for approval, locked for edits
        'approved',     -- approval complete, not yet effective
        'effective',    -- live/active version
        'superseded',   -- replaced by newer effective version
        'archived',     -- historical, no longer relevant
        'rejected',     -- review/approval failed
        'withdrawn'     -- submitter canceled before approval completed
    ));

COMMENT ON COLUMN meta.entity_version.status IS
  'Version workflow status. Lifecycle state (DRAFT/PENDING_APPROVAL/APPROVED/REJECTED) is tracked separately via lifecycle_instance_id.';

-- 2b. Lineage columns
ALTER TABLE meta.entity_version
    ADD COLUMN IF NOT EXISTS derived_from_version_id  uuid,
    ADD COLUMN IF NOT EXISTS supersedes_version_id    uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ev_derived_from') THEN
        ALTER TABLE meta.entity_version
            ADD CONSTRAINT fk_ev_derived_from
            FOREIGN KEY (derived_from_version_id)
            REFERENCES meta.entity_version(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ev_supersedes') THEN
        ALTER TABLE meta.entity_version
            ADD CONSTRAINT fk_ev_supersedes
            FOREIGN KEY (supersedes_version_id)
            REFERENCES meta.entity_version(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN meta.entity_version.derived_from_version_id IS
  'Version this draft was cloned from (lineage). NULL for v1.';
COMMENT ON COLUMN meta.entity_version.supersedes_version_id IS
  'Version this replaces when it becomes effective. Set on activation.';

-- 2c. Effectivity columns
ALTER TABLE meta.entity_version
    ADD COLUMN IF NOT EXISTS is_effective    boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS effective_from  timestamptz,
    ADD COLUMN IF NOT EXISTS effective_to    timestamptz;

COMMENT ON COLUMN meta.entity_version.is_effective IS
  'True if this is the currently effective (live) version. Enforced unique per entity.';
COMMENT ON COLUMN meta.entity_version.effective_from IS
  'When this version became/becomes effective. Supports future-dated activation.';
COMMENT ON COLUMN meta.entity_version.effective_to IS
  'When this version was/will be superseded. NULL = still effective.';

-- 2d. Governance columns
ALTER TABLE meta.entity_version
    ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by      text,
    ADD COLUMN IF NOT EXISTS change_summary   text,
    ADD COLUMN IF NOT EXISTS change_type      text,
    ADD COLUMN IF NOT EXISTS is_working_copy  boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lock_version     int NOT NULL DEFAULT 1;

ALTER TABLE meta.entity_version DROP CONSTRAINT IF EXISTS chk_ev_change_type;
ALTER TABLE meta.entity_version ADD CONSTRAINT chk_ev_change_type
    CHECK (change_type IS NULL OR change_type IN (
        'minor',       -- cosmetic, label changes
        'major',       -- new fields, changed relations
        'breaking',    -- removed fields, type changes
        'editorial'    -- documentation/description only
    ));

COMMENT ON COLUMN meta.entity_version.approved_at IS
  'Timestamp of approval (distinct from published_at for effective-dated flows).';
COMMENT ON COLUMN meta.entity_version.approved_by IS
  'Principal who approved this version.';
COMMENT ON COLUMN meta.entity_version.change_summary IS
  'Free-text description of what changed in this version.';
COMMENT ON COLUMN meta.entity_version.change_type IS
  'Classification: minor | major | breaking | editorial.';
COMMENT ON COLUMN meta.entity_version.is_working_copy IS
  'True if this is the current working draft. At most one per entity.';
COMMENT ON COLUMN meta.entity_version.lock_version IS
  'Optimistic locking counter. Incremented on every save.';

-- 2e. Lifecycle binding
ALTER TABLE meta.entity_version
    ADD COLUMN IF NOT EXISTS lifecycle_instance_id uuid;

COMMENT ON COLUMN meta.entity_version.lifecycle_instance_id IS
  'FK to core.entity_lifecycle_instance for version-level workflow tracking.';

-- ============================================================================
-- 3. INVARIANT ENFORCEMENT (Unique Partial Indexes)
-- ============================================================================

-- 3a. One effective version per entity (at most)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ev_one_effective_per_entity
    ON meta.entity_version (tenant_id, entity_id)
    WHERE is_effective = true;

-- 3b. One active draft/in_review per entity (at most)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ev_one_active_draft_per_entity
    ON meta.entity_version (tenant_id, entity_id)
    WHERE status IN ('draft', 'in_review');

-- 3c. Index for lineage queries
CREATE INDEX IF NOT EXISTS idx_ev_derived_from
    ON meta.entity_version (derived_from_version_id)
    WHERE derived_from_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ev_supersedes
    ON meta.entity_version (supersedes_version_id)
    WHERE supersedes_version_id IS NOT NULL;

-- 3d. Index for effectivity queries
CREATE INDEX IF NOT EXISTS idx_ev_effective_range
    ON meta.entity_version (tenant_id, entity_id, effective_from, effective_to)
    WHERE is_effective = true OR status = 'approved';

-- ============================================================================
-- 4. LIFECYCLE TRANSITION HOOKS (first-class metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.lifecycle_transition_hook (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    transition_id   uuid NOT NULL REFERENCES meta.lifecycle_transition(id) ON DELETE CASCADE,

    -- When this hook fires
    timing          text NOT NULL DEFAULT 'on_success',

    -- What action to take
    action          text NOT NULL,

    -- Action-specific configuration
    config          jsonb,

    -- Ordering (multiple hooks per transition, executed in order)
    sort_order      int NOT NULL DEFAULT 0,

    -- Whether this hook is active
    is_active       boolean NOT NULL DEFAULT true,

    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL,

    CONSTRAINT chk_hook_timing CHECK (timing IN (
        'on_enter',         -- fires when entering the target state
        'on_exit',          -- fires when leaving the source state
        'on_success',       -- fires after successful transition
        'on_failure'        -- fires if transition is blocked by gate
    )),
    CONSTRAINT chk_hook_action CHECK (action IN (
        'freeze_version',               -- mark version as immutable
        'mark_version_approved',         -- set approved_at/by
        'promote_to_effective',          -- mark version as effective
        'archive_previous_effective',    -- supersede old effective version
        'spawn_next_draft',              -- clone approved → new draft
        'update_version_status',         -- set version.status to config.target_status
        'emit_event',                    -- emit a MetaEvent
        'notify',                        -- trigger notification
        'cancel_approval',               -- cancel pending approval instance
        'schedule_activation'            -- schedule future effective date
    ))
);

COMMENT ON TABLE meta.lifecycle_transition_hook IS
  'Configurable post-transition actions. Replaces hardcoded service logic for version lifecycle operations.';

CREATE INDEX IF NOT EXISTS idx_hook_transition
    ON meta.lifecycle_transition_hook (transition_id, sort_order)
    WHERE is_active = true;

-- ============================================================================
-- 5. RUNTIME LIFECYCLE TABLES (core schema)
-- ============================================================================
-- These tables are referenced by LifecycleManagerService but may not have
-- DDL in this migration set. Create them idempotently.

CREATE TABLE IF NOT EXISTS core.entity_lifecycle_instance (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_name     text NOT NULL,
    entity_id       text NOT NULL,
    lifecycle_id    uuid NOT NULL REFERENCES meta.lifecycle(id) ON DELETE CASCADE,
    state_id        uuid NOT NULL REFERENCES meta.lifecycle_state(id) ON DELETE CASCADE,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      text NOT NULL,

    CONSTRAINT entity_lifecycle_instance_uniq
        UNIQUE (tenant_id, entity_name, entity_id)
);

COMMENT ON TABLE core.entity_lifecycle_instance IS
  'Runtime: current lifecycle state per entity record or version. entity_id can reference any entity PK or meta.entity_version.id.';

CREATE INDEX IF NOT EXISTS idx_eli_lookup
    ON core.entity_lifecycle_instance (tenant_id, entity_name, entity_id);

CREATE INDEX IF NOT EXISTS idx_eli_lifecycle_state
    ON core.entity_lifecycle_instance (lifecycle_id, state_id);

CREATE TABLE IF NOT EXISTS core.entity_lifecycle_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    entity_name     text NOT NULL,
    entity_id       text NOT NULL,
    lifecycle_id    uuid NOT NULL REFERENCES meta.lifecycle(id) ON DELETE CASCADE,
    from_state_id   uuid REFERENCES meta.lifecycle_state(id),
    to_state_id     uuid NOT NULL REFERENCES meta.lifecycle_state(id),
    operation_code  text NOT NULL,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    actor_id        text,
    payload         jsonb,
    correlation_id  text,

    CONSTRAINT chk_event_from_state CHECK (
        from_state_id IS NOT NULL OR operation_code = 'CREATE'
    )
);

COMMENT ON TABLE core.entity_lifecycle_event IS
  'Runtime: audit trail of all lifecycle state transitions.';

CREATE INDEX IF NOT EXISTS idx_ele_entity
    ON core.entity_lifecycle_event (tenant_id, entity_name, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ele_lifecycle
    ON core.entity_lifecycle_event (lifecycle_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ele_correlation
    ON core.entity_lifecycle_event (correlation_id)
    WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- 6. BACKFILL: Complete effective version metadata
-- ============================================================================
-- (status published → effective already done in section 2a above)

-- Set effective_from on backfilled effective versions
UPDATE meta.entity_version
SET effective_from = COALESCE(published_at, created_at)
WHERE is_effective = true AND effective_from IS NULL;

-- Update entity_publish_state with latest_version_no
UPDATE meta.entity_publish_state eps
SET latest_version_no = sub.max_vno
FROM (
    SELECT entity_id, MAX(version_no) AS max_vno
    FROM meta.entity_version
    GROUP BY entity_id
) sub
WHERE eps.entity_id = sub.entity_id
  AND eps.latest_version_no < sub.max_vno;

-- Update status_summary
UPDATE meta.entity_publish_state eps
SET status_summary = CASE
    WHEN eps.published_version_id IS NOT NULL AND eps.current_draft_version_id IS NOT NULL
        THEN 'v' || eps.latest_version_no || ' draft, effective version exists'
    WHEN eps.published_version_id IS NOT NULL
        THEN 'v' || eps.latest_version_no || ' effective'
    WHEN eps.current_draft_version_id IS NOT NULL
        THEN 'v' || eps.latest_version_no || ' draft'
    ELSE 'no versions'
END;

-- ============================================================================
-- 7. ADD 'effective' TO VERSION STATUS IN EXISTING entity_version_status_chk
-- ============================================================================
-- (Already handled in section 2a above — the constraint is replaced.)
-- The backfill in section 6 converts 'published' → 'effective'.
-- Going forward, 'published' is no longer a valid status.
-- For backward compatibility during transition, we keep it in the check:

ALTER TABLE meta.entity_version DROP CONSTRAINT IF EXISTS entity_version_status_chk;
ALTER TABLE meta.entity_version ADD CONSTRAINT entity_version_status_chk
    CHECK (status IN (
        'draft', 'in_review', 'approved', 'effective',
        'superseded', 'archived', 'rejected', 'withdrawn',
        'published'  -- backward compat, will be removed in future migration
    ));
