-- ============================================================================
-- Runtime Query Indexes
-- ============================================================================
-- Adds practical indexes for the most common runtime access patterns.
-- These supplement the existing metadata discovery indexes with
-- operational query coverage.
--
-- All indexes use CREATE IF NOT EXISTS for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. meta.field — Active fields ordered by sort_order (hot path)
-- ============================================================================
-- Query: WHERE entity_version_id = ? AND tenant_id = ? AND is_active = true
--        ORDER BY sort_order ASC, name ASC
--
-- Before: idx_field_entity_version(tenant_id, entity_version_id) covers the
--   equality predicates but is_active is a post-index filter and ORDER BY
--   requires a Sort node.
--
-- After: This covering index eliminates both the filter and the sort.
--   The partial index (WHERE is_active = true) keeps it small — inactive
--   fields are excluded from the index entirely.

CREATE INDEX IF NOT EXISTS idx_field_active_ordered
    ON meta.field (tenant_id, entity_version_id, sort_order, name)
    WHERE is_active = true;

-- ============================================================================
-- 2. meta.entity — Lookup by table_schema + table_name (reverse resolution)
-- ============================================================================
-- Query: WHERE table_schema = ? AND table_name = ? AND tenant_id = ?
--        AND is_active = true
--
-- Before: No useful index — falls back to idx_entity_kind(tenant_id, kind)
--   which only matches tenant_id and post-filters everything else.
--
-- After: Direct index lookup for the reverse-resolution path (table → entity).

CREATE INDEX IF NOT EXISTS idx_entity_table_lookup
    ON meta.entity (tenant_id, table_schema, table_name)
    WHERE is_active = true;

-- ============================================================================
-- 3. meta.entity — Active entity by name (primary resolution)
-- ============================================================================
-- Query: WHERE name = ? AND tenant_id = ? AND is_active = true
--
-- Before: entity_name_uniq(tenant_id, name) exists as a UNIQUE index but
--   doesn't filter on is_active, so the planner sometimes picks idx_entity_kind
--   instead.
--
-- After: Partial index on active entities by name. The planner can use this
--   directly for the is_active=true predicate without post-filtering.
--   Smaller than the unique index since it excludes deactivated entities.

CREATE INDEX IF NOT EXISTS idx_entity_active_name
    ON meta.entity (tenant_id, name)
    WHERE is_active = true;

-- ============================================================================
-- 4. meta.entity_version — Latest published version lookup
-- ============================================================================
-- Query: WHERE entity_id = ? AND tenant_id = ? AND status = 'published'
--        ORDER BY version_no DESC LIMIT 1
--
-- Before: idx_entity_version_entity_status(tenant_id, entity_id, status)
--   covers equality but ORDER BY version_no DESC requires a Sort node.
--
-- After: Adding version_no to the index lets the planner use a backward
--   index scan to satisfy ORDER BY ... DESC LIMIT 1 without sorting.

CREATE INDEX IF NOT EXISTS idx_entity_version_published_latest
    ON meta.entity_version (tenant_id, entity_id, version_no DESC)
    WHERE status = 'published';

-- ============================================================================
-- 5. meta.field — Computed fields per version (dependency graph resolution)
-- ============================================================================
-- Query: WHERE entity_version_id = ? AND is_computed = true
--
-- Used by the compiler's dependency graph validation pass.
-- Partial index keeps it tiny (only computed fields).

CREATE INDEX IF NOT EXISTS idx_field_computed
    ON meta.field (tenant_id, entity_version_id)
    WHERE is_computed = true;

-- ============================================================================
-- 6. meta.field — Collection fields per version
-- ============================================================================
-- Query: WHERE entity_version_id = ? AND cardinality = 'many'
--
-- Used by collection field resolution (child row queries, aggregates).
-- Partial index keeps it tiny.

CREATE INDEX IF NOT EXISTS idx_field_collection
    ON meta.field (tenant_id, entity_version_id)
    WHERE cardinality = 'many';
