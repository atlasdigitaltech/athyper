-- ============================================================================
-- Collection Behavior Hardening
-- ============================================================================
-- Strengthens the collection_behavior JSONB column on meta.field with
-- production-grade semantics: ownership mode, persistence mode, delete mode,
-- duplicate handling, aggregate strategy, draft rows, row validation.
--
-- All constraints use DROP IF EXISTS + ADD for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. Ownership mode must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_ownership;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_ownership
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'ownership'
        OR (collection_behavior ->> 'ownership') IN ('owned', 'linked')
    );

-- ============================================================================
-- 2. Persistence mode must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_persistence_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_persistence_mode
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'persistenceMode'
        OR (collection_behavior ->> 'persistenceMode') IN ('inline', 'reference_only')
    );

-- ============================================================================
-- 3. Delete mode must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_delete_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_delete_mode
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'deleteMode'
        OR (collection_behavior ->> 'deleteMode') IN ('cascade', 'restrict', 'detach')
    );

-- ============================================================================
-- 4. Editor style must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_editor_style;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_editor_style
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'editorStyle'
        OR (collection_behavior ->> 'editorStyle') IN ('grid', 'subform', 'tags')
    );

-- ============================================================================
-- 5. Aggregate strategy must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_aggregate_strategy;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_aggregate_strategy
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'aggregateStrategy'
        OR (collection_behavior ->> 'aggregateStrategy') IN ('live', 'on_save', 'manual')
    );

-- ============================================================================
-- 6. Row validation strategy must be a known value
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_row_validation;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_row_validation
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'rowValidation'
        OR (collection_behavior ->> 'rowValidation') IN ('on_change', 'on_save', 'on_submit')
    );

-- ============================================================================
-- 7. Boolean fields must actually be boolean
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_booleans;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_booleans
    CHECK (
        collection_behavior IS NULL
        OR (
            (NOT collection_behavior ? 'ordering' OR jsonb_typeof(collection_behavior -> 'ordering') = 'boolean')
            AND (NOT collection_behavior ? 'allowDuplicates' OR jsonb_typeof(collection_behavior -> 'allowDuplicates') = 'boolean')
            AND (NOT collection_behavior ? 'allowDraftRows' OR jsonb_typeof(collection_behavior -> 'allowDraftRows') = 'boolean')
        )
    );

-- ============================================================================
-- 8. Numeric fields must be numbers
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_numerics;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_numerics
    CHECK (
        collection_behavior IS NULL
        OR (
            (NOT collection_behavior ? 'minItems' OR jsonb_typeof(collection_behavior -> 'minItems') = 'number')
            AND (NOT collection_behavior ? 'maxItems' OR jsonb_typeof(collection_behavior -> 'maxItems') = 'number')
        )
    );

-- ============================================================================
-- 9. allowDuplicates only valid for linked ownership
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_duplicates_linked;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_duplicates_linked
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'allowDuplicates'
        OR (collection_behavior ->> 'allowDuplicates') = 'false'
        OR (collection_behavior ->> 'ownership') = 'linked'
    );

-- ============================================================================
-- 10. orderField requires ordering=true
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_order_field;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_order_field
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'orderField'
        OR (collection_behavior ->> 'ordering') = 'true'
    );

-- ============================================================================
-- 11. Column comment update
-- ============================================================================

COMMENT ON COLUMN meta.field.collection_behavior IS
  'For cardinality=many fields. Shape: { ownership?: "owned"|"linked", persistenceMode?: "inline"|"reference_only", deleteMode?: "cascade"|"restrict"|"detach", ordering?: bool, orderField?: string, editorStyle?: "grid"|"subform"|"tags", minItems?: number, maxItems?: number, allowDuplicates?: bool (linked only), aggregates?: [{field,op,label}], aggregateStrategy?: "live"|"on_save"|"manual", allowDraftRows?: bool, rowValidation?: "on_change"|"on_save"|"on_submit" }. Defaults: ownership=owned, persistenceMode=inline (owned)/reference_only (linked), deleteMode=cascade (owned)/detach (linked).';
