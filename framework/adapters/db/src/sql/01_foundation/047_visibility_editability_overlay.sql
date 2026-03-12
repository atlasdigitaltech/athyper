-- ============================================================================
-- Visibility & Editability Overlay Model
-- ============================================================================
-- Adds DB constraints for the three-layer override model:
--   Layer 1: base standard (field.visibility / field.editability on meta.field)
--   Layer 2: customer overlay (overlay_change.value with mode: replace|extend)
--   Layer 3: runtime resolved (computed by resolution engine)
--
-- The visibility/editability columns on meta.field store Layer 1 (base).
-- Overlay changes are stored in meta.overlay_change (existing overlay system).
-- This migration tightens constraints on the base layer values.
--
-- Also adds structural validation for visibility/editability JSONB values.
-- ============================================================================

-- ============================================================================
-- 1. Visibility JSONB structural validation
-- ============================================================================

-- Visibility structural validation
-- Accepts two formats:
--   Flat (legacy):    { create?: "visible"|"hidden"|"internal", view?: ..., edit?: ... }
--   Structured (v2):  { defaults?: { create?, view?, edit? }, rules?: [...] }
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_visibility_values;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_visibility_values
    CHECK (
        visibility IS NULL
        OR (
            -- Structured format: validate defaults sub-object if present
            visibility ? 'defaults'
            AND (
                visibility -> 'defaults' IS NULL
                OR (
                    (NOT (visibility -> 'defaults') ? 'create' OR (visibility -> 'defaults' ->> 'create') IN ('visible', 'hidden', 'internal'))
                    AND (NOT (visibility -> 'defaults') ? 'view' OR (visibility -> 'defaults' ->> 'view') IN ('visible', 'hidden', 'internal'))
                    AND (NOT (visibility -> 'defaults') ? 'edit' OR (visibility -> 'defaults' ->> 'edit') IN ('visible', 'hidden', 'internal'))
                )
            )
        )
        OR (
            -- Flat format (legacy): validate top-level keys
            NOT visibility ? 'defaults'
            AND (NOT visibility ? 'create' OR (visibility ->> 'create') IN ('visible', 'hidden', 'internal'))
            AND (NOT visibility ? 'view' OR (visibility ->> 'view') IN ('visible', 'hidden', 'internal'))
            AND (NOT visibility ? 'edit' OR (visibility ->> 'edit') IN ('visible', 'hidden', 'internal'))
        )
    );

-- Visibility must only contain known top-level keys
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_visibility_keys;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_visibility_keys
    CHECK (
        visibility IS NULL
        OR NOT (visibility ?| array['mode'])  -- prevent overlay shape in base column (rules now allowed)
    );

-- ============================================================================
-- 2. Editability JSONB structural validation
-- ============================================================================

-- Editability structural validation
-- Accepts two formats:
--   Flat (legacy):    { create?: "editable"|"read_only"|"system_managed"|"computed", edit?: ... }
--   Structured (v2):  { defaults?: { create?, edit? }, rules?: [...] }
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_editability_values;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_editability_values
    CHECK (
        editability IS NULL
        OR (
            -- Structured format: validate defaults sub-object if present
            editability ? 'defaults'
            AND (
                editability -> 'defaults' IS NULL
                OR (
                    (NOT (editability -> 'defaults') ? 'create' OR (editability -> 'defaults' ->> 'create') IN ('editable', 'read_only', 'system_managed', 'computed'))
                    AND (NOT (editability -> 'defaults') ? 'edit' OR (editability -> 'defaults' ->> 'edit') IN ('editable', 'read_only', 'system_managed', 'computed'))
                )
            )
        )
        OR (
            -- Flat format (legacy): validate top-level keys
            NOT editability ? 'defaults'
            AND (NOT editability ? 'create' OR (editability ->> 'create') IN ('editable', 'read_only', 'system_managed', 'computed'))
            AND (NOT editability ? 'edit' OR (editability ->> 'edit') IN ('editable', 'read_only', 'system_managed', 'computed'))
        )
    );

-- Editability must only contain known top-level keys
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_editability_keys;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_editability_keys
    CHECK (
        editability IS NULL
        OR NOT (editability ?| array['mode'])  -- prevent overlay shape in base column (rules now allowed)
    );

-- ============================================================================
-- 3. Column comment updates
-- ============================================================================

COMMENT ON COLUMN meta.field.visibility IS
  'Base standard visibility per context (Layer 1). Shape: { create?: "visible"|"hidden"|"internal", view?: ..., edit?: ... }. Defaults to "visible" for all contexts. Customer overlays (Layer 2) use mode: "replace"|"extend" with restrictiveness ranking: hidden > internal > visible. Resolved at runtime (Layer 3).';

COMMENT ON COLUMN meta.field.editability IS
  'Base standard editability per context (Layer 1). Shape: { create?: "editable"|"read_only"|"system_managed"|"computed", edit?: ... }. Defaults to "editable" for all contexts. Customer overlays (Layer 2) use mode: "replace"|"extend" with restrictiveness ranking: computed > system_managed > read_only > editable. Resolved at runtime (Layer 3).';
