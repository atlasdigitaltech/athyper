-- ============================================================================
-- Field Column Name Uniqueness & Versioning Clarity
-- ============================================================================
-- Tightens the meta.field schema around column_name:
--
--   1. Backfill any NULL column_name values with the field name
--   2. Set column_name NOT NULL with DEFAULT (using name as fallback)
--   3. Add UNIQUE constraint on (tenant_id, entity_version_id, column_name)
--      as a partial index excluding virtual computed fields (no physical column)
--   4. Add CHECK: column_name format must be valid snake_case
--
-- Versioning lifecycle clarity:
--   - field_name_uniq: UNIQUE(tenant_id, entity_version_id, name) — already exists
--     Scopes logical field name uniqueness to a single entity version.
--     Same field name CAN appear across multiple versions (by design).
--
--   - field_column_uniq (new): UNIQUE(tenant_id, entity_version_id, column_name)
--     Scopes physical column mapping uniqueness to a single entity version.
--     Prevents two fields from mapping to the same DB column within one version.
--     Excludes virtual computed fields (they have no physical column).
--
--   - Deprecated fields retain their name/column_name slots — they cannot be
--     reused within the same version. This is correct: deprecation is a warning,
--     not a deletion.
--
-- All operations use IF NOT EXISTS / DROP IF EXISTS for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. Backfill NULL column_name values (safety — may already be clean)
-- ============================================================================

UPDATE meta.field
SET column_name = name
WHERE column_name IS NULL;

-- ============================================================================
-- 2. Set column_name NOT NULL with DEFAULT
-- ============================================================================
-- The DEFAULT is a placeholder — the application always sets column_name
-- explicitly. But NOT NULL prevents accidental omission.

ALTER TABLE meta.field ALTER COLUMN column_name SET DEFAULT '';
ALTER TABLE meta.field ALTER COLUMN column_name SET NOT NULL;

-- ============================================================================
-- 3. UNIQUE constraint on physical column name per version
-- ============================================================================
-- Partial index: excludes virtual computed fields which have no physical column.
-- Virtual computed fields may have column_name = '' or a placeholder since
-- they are not persisted.

DROP INDEX IF EXISTS meta.field_column_uniq;
CREATE UNIQUE INDEX field_column_uniq
    ON meta.field (tenant_id, entity_version_id, column_name)
    WHERE NOT (is_computed = true AND compute_mode = 'virtual');

-- ============================================================================
-- 4. CHECK: column_name format (snake_case when non-empty)
-- ============================================================================
-- column_name must be lowercase snake_case (matching physical DB column naming)
-- or empty string (for virtual computed fields before column assignment).

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_column_name_format;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_column_name_format
    CHECK (
        column_name = ''
        OR column_name ~ '^[a-z][a-z0-9_]*$'
    );

-- ============================================================================
-- 5. CHECK: virtual computed fields don't need a real column_name
-- ============================================================================
-- Non-virtual fields must have a non-empty column_name.
-- Virtual computed fields are exempt (they have no physical column).

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_column_name_required;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_column_name_required
    CHECK (
        column_name != ''
        OR (is_computed = true AND compute_mode = 'virtual')
    );

-- ============================================================================
-- 6. Column comment updates
-- ============================================================================

COMMENT ON COLUMN meta.field.name IS
  'Logical field name (camelCase or snake_case). Unique within (tenant_id, entity_version_id). Same name can appear across different entity versions by design.';

COMMENT ON COLUMN meta.field.column_name IS
  'Physical DB column name (snake_case). Unique within (tenant_id, entity_version_id) for non-virtual fields. Must be non-empty except for virtual computed fields. Maps to the actual column in the entity''s data table.';
