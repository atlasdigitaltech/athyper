-- ============================================================================
-- Data Type Governance & Legacy Field Deprecation
-- ============================================================================
-- Closes the major gap: data_type has no CHECK constraint, allowing typos and
-- invalid values like 'strng', 'currency', 'lookup' to pass through.
--
-- Also establishes deprecation policy for legacy fields:
--   - validation (deprecated → use constraints)
--   - lookup_config (deprecated → use lookup_profile + reference_config)
--   - ui_type (deprecated → use ui_hint.type)
--   - is_required as independently authored (should derive from constraints)
--
-- Deprecation strategy:
--   Phase 1 (this migration): add data_type CHECK, add advisory constraints
--             that WARN via compiler diagnostics but don't block writes yet
--   Phase 2 (future): forbid new writes to legacy columns
--   Phase 3 (future): drop legacy columns after full migration
--
-- All constraints use DROP IF EXISTS + ADD for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. data_type CHECK constraint (closed set)
-- ============================================================================
-- Matches FieldType from framework/core/src/meta/types.ts exactly.

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_data_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_data_type
    CHECK (
        -- Canonical META types (preferred for new fields)
        data_type IN (
            'string', 'text', 'integer', 'number', 'decimal',
            'boolean', 'date', 'datetime',
            'reference', 'enum', 'json', 'uuid', 'rich_text',
            'collection'
        )
        -- Physical PG types from DDL-generated entity fields (system-authored)
        OR data_type IN (
            'bigint', 'smallint', 'int',
            'jsonb', 'timestamptz', 'timestamp', 'time',
            'text[]', 'varchar', 'char',
            'numeric', 'float', 'double precision', 'real',
            'bytea', 'inet', 'cidr', 'macaddr',
            'serial', 'bigserial'
        )
        -- Parameterized PG types: varchar(N), char(N), numeric(P,S), etc.
        OR data_type ~ '^(varchar|char|numeric|decimal)\(\d+(,\s*\d+)?\)$'
    );

-- ============================================================================
-- 2. ui_type CHECK constraint (legacy compatibility guardrail)
-- ============================================================================
-- ui_type is legacy but still referenced in some runtime paths.
-- Constrain to known values to prevent drift while it's still in use.

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_ui_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_ui_type
    CHECK (
        ui_type IS NULL
        OR ui_type IN (
            -- Modern canonical UI types
            'text', 'textarea', 'number', 'toggle', 'select',
            'datepicker', 'reference-picker', 'json-editor', 'hidden',
            'money', 'percent', 'rich-text', 'color-picker',
            'phone', 'email', 'url',
            -- Collection UI types
            'grid', 'inline-list',
            -- Legacy UI types (from system-generated entities)
            'boolean', 'code', 'currency', 'date', 'datetime',
            'json', 'lookup', 'percentage', 'tags'
        )
    );

-- ============================================================================
-- 3. is_required ↔ constraints consistency advisory
-- ============================================================================
-- is_required and constraints.required / constraints.nullable can conflict.
-- This constraint prevents the most dangerous contradiction:
--   is_required=true but constraints says nullable=true
--
-- The compiler will emit diagnostics for other mismatches.

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_required_consistency;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_required_consistency
    CHECK (
        constraints IS NULL
        OR is_required = false
        OR NOT (constraints ? 'nullable')
        OR (constraints ->> 'nullable') != 'true'
    );

-- ============================================================================
-- 4. data_type='enum' requires enum_config
-- ============================================================================
-- An enum field without enum_config is structurally incomplete.

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_enum_requires_config;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_enum_requires_config
    CHECK (
        data_type != 'enum'
        OR enum_config IS NOT NULL
    );

-- ============================================================================
-- 5. data_type='reference' requires reference_config
-- ============================================================================
-- A reference field without reference_config has no target entity.
-- (chk_field_ref_data_type already ensures ref_config → data_type=reference/uuid,
--  this is the reverse: data_type=reference → ref_config must exist)

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_reference_requires_config;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_reference_requires_config
    CHECK (
        data_type != 'reference'
        OR reference_config IS NOT NULL
    );

-- ============================================================================
-- 6. format='money' requires decimal-compatible data_type
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_money_format_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_money_format_type
    CHECK (
        format IS NULL
        OR format != 'money'
        OR data_type IN ('decimal', 'number', 'integer')
    );

-- ============================================================================
-- 7. Column comment updates
-- ============================================================================

COMMENT ON COLUMN meta.field.data_type IS
  'Canonical data type (DB-constrained): string, text, integer, number, decimal, boolean, date, datetime, reference, enum, json, uuid, rich_text. Drives storage, validation, API contract, and constraint family validation.';

COMMENT ON COLUMN meta.field.ui_type IS
  'DEPRECATED — use ui_hint.type instead. Legacy UI component type. Constrained to known values for backward compatibility. Compiler emits warning when both ui_type and ui_hint.type are present.';

COMMENT ON COLUMN meta.field.is_required IS
  'Convenience flag. Should be consistent with constraints.required / constraints.nullable. Compiler emits warning on mismatch. In future versions, this will become a derived field.';

COMMENT ON COLUMN meta.field.validation IS
  'DEPRECATED — use constraints JSONB instead. Legacy freeform validation rules. Compiler emits warning when both validation and constraints are present on the same field.';

COMMENT ON COLUMN meta.field.lookup_config IS
  'DEPRECATED — use lookup_profile (search/display UX) + reference_config (structural wiring) instead. Compiler emits warning when lookup_config is present alongside lookup_profile or reference_config.';
