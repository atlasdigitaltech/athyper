-- ============================================================================
-- Collection Behavior Semantic Validation
-- ============================================================================
-- Tightens CHECK constraints on collection_behavior JSONB to catch
-- contradictory settings that users will inevitably create in Meta Studio.
--
-- All constraints use DROP IF EXISTS + ADD for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. ownership='owned' + deleteMode='detach' is contradictory
-- ============================================================================
-- Owned children have coupled lifecycle — detach makes no sense.
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_owned_no_detach;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_owned_no_detach
    CHECK (
        collection_behavior IS NULL
        OR (collection_behavior ->> 'ownership') != 'owned'
        OR (collection_behavior ->> 'deleteMode') IS NULL
        OR (collection_behavior ->> 'deleteMode') != 'detach'
    );

-- ============================================================================
-- 2. minItems <= maxItems
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_min_max_items;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_min_max_items
    CHECK (
        collection_behavior IS NULL
        OR NOT (collection_behavior ? 'minItems' AND collection_behavior ? 'maxItems')
        OR (
            jsonb_typeof(collection_behavior -> 'minItems') = 'number'
            AND jsonb_typeof(collection_behavior -> 'maxItems') = 'number'
            AND (collection_behavior ->> 'minItems')::int <= (collection_behavior ->> 'maxItems')::int
        )
    );

-- ============================================================================
-- 3. minItems / maxItems must be non-negative integers
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_items_non_negative;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_items_non_negative
    CHECK (
        collection_behavior IS NULL
        OR (
            (NOT collection_behavior ? 'minItems' OR (
                jsonb_typeof(collection_behavior -> 'minItems') = 'number'
                AND (collection_behavior ->> 'minItems')::int >= 0
            ))
            AND (NOT collection_behavior ? 'maxItems' OR (
                jsonb_typeof(collection_behavior -> 'maxItems') = 'number'
                AND (collection_behavior ->> 'maxItems')::int >= 0
            ))
        )
    );

-- ============================================================================
-- 4. editorStyle must be a known value
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_editor_style;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_editor_style
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'editorStyle'
        OR (collection_behavior ->> 'editorStyle') IN ('grid', 'subform', 'tags')
    );

-- ============================================================================
-- 5. ownership must be a known value
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_ownership;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_ownership
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'ownership'
        OR (collection_behavior ->> 'ownership') IN ('owned', 'linked')
    );

-- ============================================================================
-- 6. persistenceMode must be a known value
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_persistence_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_persistence_mode
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'persistenceMode'
        OR (collection_behavior ->> 'persistenceMode') IN ('inline', 'reference_only')
    );

-- ============================================================================
-- 7. deleteMode must be a known value
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_delete_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_delete_mode
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'deleteMode'
        OR (collection_behavior ->> 'deleteMode') IN ('cascade', 'restrict', 'detach')
    );

-- ============================================================================
-- 8. ordering boolean + orderField string
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_ordering_types;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_ordering_types
    CHECK (
        collection_behavior IS NULL
        OR (
            (NOT collection_behavior ? 'ordering' OR jsonb_typeof(collection_behavior -> 'ordering') = 'boolean')
            AND (NOT collection_behavior ? 'orderField' OR jsonb_typeof(collection_behavior -> 'orderField') = 'string')
        )
    );

-- ============================================================================
-- 9. aggregateStrategy must be a known value
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_aggregate_strategy;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_aggregate_strategy
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'aggregateStrategy'
        OR (collection_behavior ->> 'aggregateStrategy') IN ('live', 'on_save', 'manual')
    );

-- ============================================================================
-- 10. rowValidation must be a known value
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_row_validation;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_row_validation
    CHECK (
        collection_behavior IS NULL
        OR NOT collection_behavior ? 'rowValidation'
        OR (collection_behavior ->> 'rowValidation') IN ('on_change', 'on_save', 'on_submit')
    );

-- ============================================================================
-- 11. boolean flags must be boolean
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_booleans;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_booleans
    CHECK (
        collection_behavior IS NULL
        OR (
            (NOT collection_behavior ? 'allowDuplicates' OR jsonb_typeof(collection_behavior -> 'allowDuplicates') = 'boolean')
            AND (NOT collection_behavior ? 'allowDraftRows' OR jsonb_typeof(collection_behavior -> 'allowDraftRows') = 'boolean')
        )
    );

-- ============================================================================
-- 12. collection_behavior only valid on cardinality=many fields
-- ============================================================================
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_collection_requires_many;
ALTER TABLE meta.field ADD CONSTRAINT chk_collection_requires_many
    CHECK (
        collection_behavior IS NULL
        OR cardinality = 'many'
    );

-- ============================================================================
-- Column comment
-- ============================================================================
COMMENT ON COLUMN meta.field.collection_behavior IS
  'Collection config (DB-constrained): { ownership: "owned"|"linked", persistenceMode: "inline"|"reference_only", deleteMode: "cascade"|"restrict"|"detach", ordering: bool, orderField: string, editorStyle: "grid"|"subform"|"tags", minItems: int>=0, maxItems: int>=0 (>=minItems), aggregateStrategy: "live"|"on_save"|"manual", rowValidation: "on_change"|"on_save"|"on_submit", allowDuplicates: bool, allowDraftRows: bool }. Only valid on cardinality=many. Owned children cannot use detach deleteMode.';
