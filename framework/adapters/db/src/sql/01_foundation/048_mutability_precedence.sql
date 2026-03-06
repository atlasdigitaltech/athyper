-- ============================================================================
-- Mutability Precedence Constraints
-- ============================================================================
-- Prevents structurally contradictory mutability configurations.
--
-- The canonical precedence chain is:
--   1. is_computed=true       → always read-only (unconditional)
--   2. is_read_only=true      → read-only all contexts
--   3. origin="system"        → read-only in business context
--   4. write_once=true        → editable only on create
--   5. editability JSONB      → per-context control (overridable by overlay)
--   6. convention columns     → lifecycle/hierarchy/PK (runtime, not stored)
--   7. is_deprecated=true     → read-only (safety)
--   8. ui_hint advisory       → rendering hints only, NEVER overrides domain truth
--
-- These constraints catch nonsensical configurations at INSERT/UPDATE time:
--   - is_computed + editability saying "editable" → contradicts Layer 1
--   - is_read_only + editability saying "editable" → contradicts Layer 2
--   - is_computed + write_once → redundant/confusing
--
-- All constraints use DROP IF EXISTS + ADD to be idempotent.
-- ============================================================================

-- ============================================================================
-- 1. Computed fields must not have editability overrides that say "editable"
-- ============================================================================
-- If is_computed=true, editability contexts should be null or "computed"/"read_only"/"system_managed".
-- Allowing "editable" when is_computed=true is a contradiction.

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_mutability_computed_editability;
ALTER TABLE meta.field ADD CONSTRAINT chk_mutability_computed_editability
    CHECK (
        is_computed = false
        OR editability IS NULL
        OR (
            (NOT editability ? 'create' OR (editability ->> 'create') != 'editable')
            AND (NOT editability ? 'edit' OR (editability ->> 'edit') != 'editable')
        )
    );

-- ============================================================================
-- 2. Read-only fields must not have editability overrides that say "editable"
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_mutability_readonly_editability;
ALTER TABLE meta.field ADD CONSTRAINT chk_mutability_readonly_editability
    CHECK (
        is_read_only = false
        OR editability IS NULL
        OR (
            (NOT editability ? 'create' OR (editability ->> 'create') != 'editable')
            AND (NOT editability ? 'edit' OR (editability ->> 'edit') != 'editable')
        )
    );

-- ============================================================================
-- 3. Computed + write_once is contradictory (both claim ownership of value lifecycle)
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_mutability_computed_writeonce;
ALTER TABLE meta.field ADD CONSTRAINT chk_mutability_computed_writeonce
    CHECK (NOT (is_computed = true AND write_once = true));

-- ============================================================================
-- 4. Read-only + write_once is contradictory (write_once implies writable on create)
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_mutability_readonly_writeonce;
ALTER TABLE meta.field ADD CONSTRAINT chk_mutability_readonly_writeonce
    CHECK (NOT (is_read_only = true AND write_once = true));

-- ============================================================================
-- 5. Column comments (updated to reflect precedence)
-- ============================================================================

COMMENT ON COLUMN meta.field.is_computed IS
  'Layer 1 (highest precedence): Computed/derived field — always read-only. Cannot be relaxed by editability, ui_hint, or overlays. Mutually exclusive with write_once.';

COMMENT ON COLUMN meta.field.is_read_only IS
  'Layer 2: Field is read-only in all contexts. Cannot be relaxed by editability or ui_hint. Mutually exclusive with write_once.';

COMMENT ON COLUMN meta.field.write_once IS
  'Layer 4: Field can only be set on creation — locked after first save. Mutually exclusive with is_computed and is_read_only.';

COMMENT ON COLUMN meta.field.editability IS
  'Layer 5: Per-context editability. Shape: { create?: "editable"|"read_only"|"system_managed"|"computed", edit?: ... }. Overridable by customer overlay (replace/extend). Cannot contradict is_computed or is_read_only (editable not allowed when those are true).';

COMMENT ON COLUMN meta.field.ui_hint IS
  'Layer 8 (lowest precedence): UI rendering advisory. Props like readOnly and lockOnEdit influence visual presentation only — they NEVER override domain/security truth from higher layers (is_computed, is_read_only, editability, etc).';
