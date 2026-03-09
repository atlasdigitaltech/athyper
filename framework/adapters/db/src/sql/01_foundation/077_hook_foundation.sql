/* ============================================================================
   Athyper — Hook Foundation: Origin, Contract Role, Safety & Structural Integrity

   Extends meta.lifecycle_transition_hook with layered hook governance:
     - origin:        system | tenant | overlay
     - layer_rank:    deterministic execution order (10=system, 20=tenant, 30=overlay)
     - contract_role: contract | extension
     - safety_level:  narrowable | replaceable (extensions only)

   Also adds structural integrity triggers that enforce:
     - Contract hooks are non-overridable (system-origin, no override target)
     - Layer rank is locked to origin
     - Sort order ranges enforced per origin band
     - Overlay hooks require overlay_id
     - System origin is immutable after creation

   Dependencies: 068_governed_versioning.sql (lifecycle_transition_hook table)
   ============================================================================ */

-- ============================================================================
-- 1. NEW COLUMNS on meta.lifecycle_transition_hook
-- ============================================================================

-- Hook origin: who owns this hook
ALTER TABLE meta.lifecycle_transition_hook
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'system';
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_hook_origin CHECK (origin IN ('system', 'tenant', 'overlay'));

-- Deterministic layer rank: controls execution order across origins.
-- system=10, tenant=20, overlay=30.  Avoids lexical sort pitfall.
ALTER TABLE meta.lifecycle_transition_hook
  ADD COLUMN IF NOT EXISTS layer_rank smallint NOT NULL DEFAULT 10;

-- Contract role: contract hooks enforce locked invariants and are structurally
-- non-overridable.  Extension hooks support notifications, integrations, etc.
ALTER TABLE meta.lifecycle_transition_hook
  ADD COLUMN IF NOT EXISTS contract_role text NOT NULL DEFAULT 'extension';
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_hook_contract_role CHECK (contract_role IN ('contract', 'extension'));

-- Safety level: governs what tenant/overlay overrides can do to this hook.
-- Only meaningful for extension hooks (contract hooks are non-overridable).
ALTER TABLE meta.lifecycle_transition_hook
  ADD COLUMN IF NOT EXISTS safety_level text NOT NULL DEFAULT 'replaceable';
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_hook_safety_level CHECK (safety_level IN ('narrowable', 'replaceable'));

-- Overlay reference: required when origin = 'overlay'
ALTER TABLE meta.lifecycle_transition_hook
  ADD COLUMN IF NOT EXISTS overlay_id uuid;
-- FK deferred until overlay table relationship is confirmed:
-- ALTER TABLE meta.lifecycle_transition_hook
--   ADD CONSTRAINT fk_hook_overlay FOREIGN KEY (overlay_id) REFERENCES meta.overlay(id);

-- ============================================================================
-- 2. STRUCTURAL CONSTRAINTS
-- ============================================================================

-- Contract hooks MUST be system-origin (no tenant/overlay can declare a contract hook)
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_contract_must_be_system CHECK (
    contract_role = 'extension'
    OR origin = 'system'
  );

-- Layer rank must be locked to origin value
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_layer_rank_origin CHECK (
    (origin = 'system'  AND layer_rank = 10) OR
    (origin = 'tenant'  AND layer_rank = 20) OR
    (origin = 'overlay' AND layer_rank = 30)
  );

-- Sort order bands enforced per origin
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_hook_sort_range CHECK (
    (origin = 'system'  AND sort_order BETWEEN 0    AND 999)  OR
    (origin = 'tenant'  AND sort_order BETWEEN 1000 AND 1999) OR
    (origin = 'overlay' AND sort_order >= 2000)
  );

-- Overlay hooks require overlay_id; non-overlay hooks must NOT have one
ALTER TABLE meta.lifecycle_transition_hook
  ADD CONSTRAINT chk_overlay_id_required CHECK (
    (origin = 'overlay' AND overlay_id IS NOT NULL) OR
    (origin != 'overlay' AND overlay_id IS NULL)
  );


-- ============================================================================
-- 3. UPDATED INDEX (deterministic total ordering)
-- ============================================================================

-- Replace the old index with one that respects layered resolution
DROP INDEX IF EXISTS meta.idx_hook_transition;

CREATE INDEX IF NOT EXISTS idx_hook_transition_layered
  ON meta.lifecycle_transition_hook (transition_id, layer_rank, sort_order, created_at, id)
  WHERE is_active = true;


-- ============================================================================
-- 4. STRUCTURAL INTEGRITY TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.fn_hook_structural_integrity()
RETURNS trigger AS $$
BEGIN
  -- Rule 1: Cannot change origin of a system hook after creation
  IF TG_OP = 'UPDATE' AND OLD.origin = 'system' AND NEW.origin != 'system' THEN
    RAISE EXCEPTION 'Cannot change origin of a system hook (id=%)', OLD.id;
  END IF;

  -- Rule 2: Cannot change contract_role after creation (contract hooks are permanent)
  IF TG_OP = 'UPDATE' AND OLD.contract_role = 'contract' AND NEW.contract_role != 'contract' THEN
    RAISE EXCEPTION 'Cannot downgrade a contract hook to extension (id=%)', OLD.id;
  END IF;

  -- Rule 3: Cannot delete or deactivate a contract hook
  IF TG_OP = 'UPDATE' AND OLD.contract_role = 'contract'
     AND OLD.is_active = true AND NEW.is_active = false THEN
    RAISE EXCEPTION 'Cannot deactivate a contract hook (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hook_structural_integrity
  BEFORE UPDATE ON meta.lifecycle_transition_hook
  FOR EACH ROW EXECUTE FUNCTION meta.fn_hook_structural_integrity();

-- Prevent deletion of contract hooks
CREATE OR REPLACE FUNCTION meta.fn_hook_contract_delete_guard()
RETURNS trigger AS $$
BEGIN
  IF OLD.contract_role = 'contract' THEN
    RAISE EXCEPTION 'Cannot delete a contract hook (id=%, action=%)', OLD.id, OLD.action;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hook_contract_delete_guard
  BEFORE DELETE ON meta.lifecycle_transition_hook
  FOR EACH ROW EXECUTE FUNCTION meta.fn_hook_contract_delete_guard();


-- ============================================================================
-- 5. BACKFILL existing hooks with correct origin/contract_role/safety_level
-- ============================================================================
-- All existing hooks are system-origin.  Contract vs extension classification
-- is derived from the canonical action safety policy, not a blanket default.

-- 5a. All existing hooks are system, layer_rank=10
UPDATE meta.lifecycle_transition_hook
SET origin = 'system', layer_rank = 10
WHERE origin IS NULL OR origin = 'system';

-- 5b. Mark version-governance invariant hooks as contract
UPDATE meta.lifecycle_transition_hook
SET contract_role = 'contract'
WHERE origin = 'system'
  AND action IN ('freeze_version', 'mark_version_approved', 'promote_to_effective', 'archive_previous_effective');

-- 5c. Mark governance event emission hooks as contract (audit trail integrity)
UPDATE meta.lifecycle_transition_hook
SET contract_role = 'contract'
WHERE origin = 'system'
  AND action = 'emit_event'
  AND config IS NOT NULL
  AND config->>'event_type' IN ('version.approved', 'version.activated', 'version.revision_started');

-- 5d. Backfill safety_level from canonical action policy
UPDATE meta.lifecycle_transition_hook
SET safety_level = CASE action
  -- Narrowable: can add more, cannot remove system ones
  WHEN 'emit_event'       THEN 'narrowable'
  WHEN 'notify'           THEN 'narrowable'
  WHEN 'cancel_approval'  THEN 'narrowable'
  WHEN 'lock_document'    THEN 'narrowable'
  WHEN 'unlock_document'  THEN 'narrowable'
  WHEN 'sync_document_registry' THEN 'narrowable'
  WHEN 'create_journal_entry'   THEN 'narrowable'
  WHEN 'create_reversal_entry'  THEN 'narrowable'
  -- Replaceable: tenant can fully override
  WHEN 'update_version_status'  THEN 'replaceable'
  WHEN 'spawn_next_draft'       THEN 'replaceable'
  WHEN 'schedule_activation'    THEN 'replaceable'
  -- Default
  ELSE 'replaceable'
END
WHERE contract_role = 'extension';


-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON COLUMN meta.lifecycle_transition_hook.origin IS
  'Who owns this hook: system (platform), tenant (customer), overlay (governed overlay change)';

COMMENT ON COLUMN meta.lifecycle_transition_hook.layer_rank IS
  'Deterministic execution order. 10=system, 20=tenant, 30=overlay. Locked to origin via constraint.';

COMMENT ON COLUMN meta.lifecycle_transition_hook.contract_role IS
  'contract: enforces locked invariant, structurally non-overridable. extension: notifications, integrations, customizable.';

COMMENT ON COLUMN meta.lifecycle_transition_hook.safety_level IS
  'For extension hooks only. narrowable: can add restrictions, not remove. replaceable: tenant can fully override.';

COMMENT ON COLUMN meta.lifecycle_transition_hook.overlay_id IS
  'Reference to meta.overlay when origin=overlay. NULL for system/tenant hooks.';
