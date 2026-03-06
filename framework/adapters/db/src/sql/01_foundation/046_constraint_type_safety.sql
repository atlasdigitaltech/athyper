-- ============================================================================
-- Constraint Type Safety (data-type-family validation)
-- ============================================================================
-- Ensures that meta.field.constraints JSONB only contains keys valid for the
-- field's data_type. Rejects nonsense combinations like `pattern` on decimal,
-- `precision` on boolean, `minLength` on datetime.
--
-- Data-Type Family Mapping:
--   Base (all types):         required, nullable
--   String (string/text):     + minLength, maxLength, pattern
--   Numeric (integer/number/decimal): + min, max, precision, scale
--   Date (date/datetime):     + minDate, maxDate
--   Enum:                     + allowedValues
--   Base-only (boolean/uuid/reference/json): no extra keys
--
-- Approach: Since PG CHECK constraints cannot use subqueries, we check that
-- keys from OTHER families are NOT present for the given data_type.
-- This is the negative-check approach: "string fields must NOT have min,
-- max, precision, scale, minDate, maxDate, allowedValues".
--
-- All constraints use DROP IF EXISTS + ADD to be idempotent.
-- ============================================================================

-- ============================================================================
-- 1. String family: must NOT have numeric/date/enum constraint keys
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_string_family;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_string_family
    CHECK (
        constraints IS NULL
        OR data_type NOT IN ('string', 'text')
        OR NOT (constraints ?| array['min', 'max', 'precision', 'scale', 'minDate', 'maxDate', 'allowedValues'])
    );

-- ============================================================================
-- 2. Numeric family: must NOT have string/date/enum constraint keys
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_numeric_family;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_numeric_family
    CHECK (
        constraints IS NULL
        OR data_type NOT IN ('integer', 'number', 'decimal')
        OR NOT (constraints ?| array['minLength', 'maxLength', 'pattern', 'minDate', 'maxDate', 'allowedValues'])
    );

-- ============================================================================
-- 3. Date family: must NOT have string/numeric/enum constraint keys
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_date_family;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_date_family
    CHECK (
        constraints IS NULL
        OR data_type NOT IN ('date', 'datetime')
        OR NOT (constraints ?| array['min', 'max', 'precision', 'scale', 'minLength', 'maxLength', 'pattern', 'allowedValues'])
    );

-- ============================================================================
-- 4. Enum family: must NOT have string/numeric/date constraint keys
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_enum_family;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_enum_family
    CHECK (
        constraints IS NULL
        OR data_type != 'enum'
        OR NOT (constraints ?| array['min', 'max', 'precision', 'scale', 'minLength', 'maxLength', 'pattern', 'minDate', 'maxDate'])
    );

-- ============================================================================
-- 5. Base-only types: must NOT have ANY family-specific keys
-- ============================================================================

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_base_only;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_base_only
    CHECK (
        constraints IS NULL
        OR data_type NOT IN ('boolean', 'uuid', 'reference', 'json')
        OR NOT (constraints ?| array['min', 'max', 'precision', 'scale', 'minLength', 'maxLength', 'pattern', 'minDate', 'maxDate', 'allowedValues'])
    );

-- ============================================================================
-- 6. Constraint value type validation (structural)
-- ============================================================================

-- required/nullable must be boolean when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_bool_types;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_bool_types
    CHECK (
        constraints IS NULL
        OR (
            (NOT constraints ? 'required'  OR jsonb_typeof(constraints -> 'required')  = 'boolean')
            AND (NOT constraints ? 'nullable' OR jsonb_typeof(constraints -> 'nullable') = 'boolean')
        )
    );

-- Numeric constraint values must be numbers
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_number_types;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_number_types
    CHECK (
        constraints IS NULL
        OR (
            (NOT constraints ? 'min'       OR jsonb_typeof(constraints -> 'min')       = 'number')
            AND (NOT constraints ? 'max'   OR jsonb_typeof(constraints -> 'max')       = 'number')
            AND (NOT constraints ? 'minLength' OR jsonb_typeof(constraints -> 'minLength') = 'number')
            AND (NOT constraints ? 'maxLength' OR jsonb_typeof(constraints -> 'maxLength') = 'number')
            AND (NOT constraints ? 'precision' OR jsonb_typeof(constraints -> 'precision') = 'number')
            AND (NOT constraints ? 'scale'     OR jsonb_typeof(constraints -> 'scale')     = 'number')
        )
    );

-- String constraint values must be strings
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_string_types;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_string_types
    CHECK (
        constraints IS NULL
        OR (
            (NOT constraints ? 'pattern' OR jsonb_typeof(constraints -> 'pattern') = 'string')
            AND (NOT constraints ? 'minDate' OR jsonb_typeof(constraints -> 'minDate') = 'string')
            AND (NOT constraints ? 'maxDate' OR jsonb_typeof(constraints -> 'maxDate') = 'string')
        )
    );

-- allowedValues must be an array when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_constraints_allowed_values_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_constraints_allowed_values_type
    CHECK (
        constraints IS NULL
        OR NOT constraints ? 'allowedValues'
        OR jsonb_typeof(constraints -> 'allowedValues') = 'array'
    );

-- ============================================================================
-- 7. Column comment updates
-- ============================================================================

COMMENT ON COLUMN meta.field.constraints IS
  'Type-safe canonical constraints. Keys validated against data_type family: base (required, nullable) for all; + string (minLength, maxLength, pattern); + numeric (min, max, precision, scale); + date (minDate, maxDate); + enum (allowedValues). Invalid combinations rejected by CHECK constraints.';

COMMENT ON COLUMN meta.field.format IS
  'Core platform semantic format (DB-constrained): email, phone, url, money, percent, password, color, country, timezone, markdown, html, ip_address, slug. For tenant-extensible tags, use ui_hint->props->semanticTag.';
