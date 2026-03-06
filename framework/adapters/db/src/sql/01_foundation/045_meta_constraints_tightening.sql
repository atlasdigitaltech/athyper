-- ============================================================================
-- Meta Constraints Tightening (043 + 044 follow-up)
-- ============================================================================
-- Adds stricter DB constraints and indexes that were deferred from the initial
-- 043/044 migrations to keep those backward-compatible.
--
-- Goals:
--   1. Prevent structurally invalid JSONB from reaching the DB
--   2. Enforce the reference_config ↔ lookup_profile boundary
--   3. Add indexes for common server-side query patterns
--   4. Ensure identity_config required shape when present
--
-- All constraints use DROP IF EXISTS + ADD to be idempotent.
-- ============================================================================

-- ============================================================================
-- 1. reference_config structural validation
-- ============================================================================

-- reference_config MUST have 'entity' when present (it's the structural anchor)
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_ref_config_entity;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_ref_config_entity
    CHECK (
        reference_config IS NULL
        OR (reference_config ? 'entity' AND jsonb_typeof(reference_config -> 'entity') = 'string'
            AND length(reference_config ->> 'entity') > 0)
    );

-- reference_config.relationshipKind must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_ref_config_kind;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_ref_config_kind
    CHECK (
        reference_config IS NULL
        OR NOT (reference_config ? 'relationshipKind')
        OR (reference_config ->> 'relationshipKind') IN (
            'many-to-one', 'one-to-one', 'one-to-many', 'many-to-many'
        )
    );

-- M:N requires all three join keys
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_ref_config_m2m;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_ref_config_m2m
    CHECK (
        reference_config IS NULL
        OR (reference_config ->> 'relationshipKind') != 'many-to-many'
        OR (
            reference_config ? 'joinEntity'
            AND reference_config ? 'joinLeftKey'
            AND reference_config ? 'joinRightKey'
        )
    );

-- ============================================================================
-- 2. lookup_profile structural validation
-- ============================================================================

-- lookup_profile.matchMode must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_lookup_match_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_lookup_match_mode
    CHECK (
        lookup_profile IS NULL
        OR NOT (lookup_profile ? 'matchMode')
        OR (lookup_profile ->> 'matchMode') IN ('exact', 'prefix', 'contains', 'token')
    );

-- lookup_profile.cacheMode must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_lookup_cache_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_lookup_cache_mode
    CHECK (
        lookup_profile IS NULL
        OR NOT (lookup_profile ? 'cacheMode')
        OR (lookup_profile ->> 'cacheMode') IN ('none', 'session', 'global')
    );

-- lookup_profile.minChars within sane range (1–10)
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_lookup_min_chars;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_lookup_min_chars
    CHECK (
        lookup_profile IS NULL
        OR NOT (lookup_profile ? 'minChars')
        OR ((lookup_profile ->> 'minChars')::int BETWEEN 1 AND 10)
    );

-- lookup_profile.pageSize within sane range (5–100)
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_lookup_page_size;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_lookup_page_size
    CHECK (
        lookup_profile IS NULL
        OR NOT (lookup_profile ? 'pageSize')
        OR ((lookup_profile ->> 'pageSize')::int BETWEEN 5 AND 100)
    );

-- lookup_profile.debounceMs within sane range (50–2000)
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_lookup_debounce;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_lookup_debounce
    CHECK (
        lookup_profile IS NULL
        OR NOT (lookup_profile ? 'debounceMs')
        OR ((lookup_profile ->> 'debounceMs')::int BETWEEN 50 AND 2000)
    );

-- ============================================================================
-- 3. identity_config structural validation (on meta.entity)
-- ============================================================================

-- identity_config MUST have 'primaryLabelField' when present
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_identity_label;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_identity_label
    CHECK (
        identity_config IS NULL
        OR (identity_config ? 'primaryLabelField'
            AND jsonb_typeof(identity_config -> 'primaryLabelField') = 'string'
            AND length(identity_config ->> 'primaryLabelField') > 0)
    );

-- ============================================================================
-- 4. format check constraint (known semantic formats only)
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_format;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_format
    CHECK (
        format IS NULL
        OR format IN (
            'email', 'phone', 'url', 'money', 'percent', 'password',
            'color', 'country', 'timezone', 'markdown', 'html',
            'ip_address', 'slug'
        )
    );

-- ============================================================================
-- 5. data_type must be reference when reference_config present
-- ============================================================================
-- Catches accidental configuration: if you set reference_config, the data_type
-- should be 'reference' or 'uuid' (legacy FK columns are typed as uuid).

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_ref_data_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_ref_data_type
    CHECK (
        reference_config IS NULL
        OR data_type IN ('reference', 'uuid')
    );

-- ============================================================================
-- 6. Indexes for lookup/reference query patterns
-- ============================================================================

-- Fast lookup of reference fields per entity version (used by resolution engine)
CREATE INDEX IF NOT EXISTS idx_field_reference
    ON meta.field (tenant_id, entity_version_id)
    WHERE reference_config IS NOT NULL OR data_type = 'reference';

-- Fast lookup of fields with lookup_profile (used by lookup API profile resolution)
CREATE INDEX IF NOT EXISTS idx_field_lookup_profile
    ON meta.field (tenant_id, entity_version_id)
    WHERE lookup_profile IS NOT NULL;

-- Entity identity_config lookup (used by lookup API for target entity resolution)
CREATE INDEX IF NOT EXISTS idx_entity_identity_config
    ON meta.entity (tenant_id)
    WHERE identity_config IS NOT NULL;

-- Searchable fields index (used by typeahead and full-text search)
CREATE INDEX IF NOT EXISTS idx_field_searchable
    ON meta.field (tenant_id, entity_version_id)
    WHERE is_searchable = true;

-- ============================================================================
-- 7. Update reference_config comment to reflect boundary
-- ============================================================================

COMMENT ON COLUMN meta.field.reference_config IS
  'STRUCTURAL reference config: { entity (required), relationshipKind, joinEntity/joinLeftKey/joinRightKey for M:N, valueField, hydrateStrategy, allowCreateInline }. Search/display UX belongs in lookup_profile.';

COMMENT ON COLUMN meta.field.lookup_profile IS
  'SEARCH/DISPLAY UX config: { displayTemplate, searchFields[{field,weight,matchModes}], matchMode, filters, filtersByContext, orderBy, minChars, debounceMs, pageSize, cacheMode, securityScope }. Structural relationship belongs in reference_config.';

COMMENT ON COLUMN meta.entity.identity_config IS
  'Entity self-identification for lookups: { primaryLabelField (required), primaryCodeField, alternateKeys[], searchAliases[], displayTemplate }. Consumed by lookup API when no field-level lookup_profile exists.';
