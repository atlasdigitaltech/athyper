-- ============================================================================
-- Structured Config JSONB Validation
-- ============================================================================
-- Strengthens CHECK constraints on the structured config JSONB columns that
-- were previously under-validated:
--   - money_config
--   - datetime_config
--   - enum_config
--   - json_config
--   - ui_hint
--
-- These columns are core runtime inputs. Without validation, malformed JSONB
-- becomes runtime unpredictability.
--
-- All constraints use DROP IF EXISTS + ADD for idempotency.
-- ============================================================================

-- ============================================================================
-- 1. money_config validation
-- ============================================================================

-- currencyMode is required and must be a known value
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_currency_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_currency_mode
    CHECK (
        money_config IS NULL
        OR (
            money_config ? 'currencyMode'
            AND (money_config ->> 'currencyMode') IN ('fixed', 'rowField', 'tenantDefault')
        )
    );

-- roundingMode must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_rounding_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_rounding_mode
    CHECK (
        money_config IS NULL
        OR NOT money_config ? 'roundingMode'
        OR (money_config ->> 'roundingMode') IN ('HALF_UP', 'HALF_EVEN', 'DOWN', 'UP')
    );

-- scaleMode must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_scale_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_scale_mode
    CHECK (
        money_config IS NULL
        OR NOT money_config ? 'scaleMode'
        OR (money_config ->> 'scaleMode') IN ('currency', 'fixed')
    );

-- fixedScale must be a non-negative number when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_fixed_scale;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_fixed_scale
    CHECK (
        money_config IS NULL
        OR NOT money_config ? 'fixedScale'
        OR (
            jsonb_typeof(money_config -> 'fixedScale') = 'number'
            AND (money_config ->> 'fixedScale')::int >= 0
        )
    );

-- allowNegative must be boolean when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_allow_negative;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_allow_negative
    CHECK (
        money_config IS NULL
        OR NOT money_config ? 'allowNegative'
        OR jsonb_typeof(money_config -> 'allowNegative') = 'boolean'
    );

-- currencyField required when currencyMode=rowField
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_currency_field;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_currency_field
    CHECK (
        money_config IS NULL
        OR (money_config ->> 'currencyMode') != 'rowField'
        OR (
            money_config ? 'currencyField'
            AND jsonb_typeof(money_config -> 'currencyField') = 'string'
            AND length(money_config ->> 'currencyField') > 0
        )
    );

-- fixedCurrency required when currencyMode=fixed
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_fixed_currency;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_fixed_currency
    CHECK (
        money_config IS NULL
        OR (money_config ->> 'currencyMode') != 'fixed'
        OR (
            money_config ? 'fixedCurrency'
            AND jsonb_typeof(money_config -> 'fixedCurrency') = 'string'
            AND length(money_config ->> 'fixedCurrency') = 3
        )
    );

-- money_config only valid for numeric data types
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_money_config_data_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_money_config_data_type
    CHECK (
        money_config IS NULL
        OR data_type IN ('decimal', 'number', 'integer', 'bigint', 'smallint', 'int', 'numeric', 'float', 'double precision', 'real')
        OR data_type ~ '^(numeric|decimal)\(\d+(,\s*\d+)?\)$'
    );

-- ============================================================================
-- 2. datetime_config validation
-- ============================================================================

-- timezoneMode is required and must be a known value
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_datetime_config_timezone_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_datetime_config_timezone_mode
    CHECK (
        datetime_config IS NULL
        OR (
            datetime_config ? 'timezoneMode'
            AND (datetime_config ->> 'timezoneMode') IN ('tenant', 'user', 'utc')
        )
    );

-- datetime_config only valid for date/datetime types
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_datetime_config_data_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_datetime_config_data_type
    CHECK (
        datetime_config IS NULL
        OR data_type IN ('date', 'datetime', 'timestamptz', 'timestamp', 'time')
    );

-- ============================================================================
-- 3. enum_config validation
-- ============================================================================

-- values must be an array when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_enum_config_values_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_enum_config_values_type
    CHECK (
        enum_config IS NULL
        OR NOT enum_config ? 'values'
        OR jsonb_typeof(enum_config -> 'values') = 'array'
    );

-- source must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_enum_config_source;
ALTER TABLE meta.field ADD CONSTRAINT chk_enum_config_source
    CHECK (
        enum_config IS NULL
        OR NOT enum_config ? 'source'
        OR (enum_config ->> 'source') IN ('static', 'dynamic')
    );

-- dynamicRef required when source=dynamic
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_enum_config_dynamic_ref;
ALTER TABLE meta.field ADD CONSTRAINT chk_enum_config_dynamic_ref
    CHECK (
        enum_config IS NULL
        OR NOT enum_config ? 'source'
        OR (enum_config ->> 'source') != 'dynamic'
        OR (
            enum_config ? 'dynamicRef'
            AND jsonb_typeof(enum_config -> 'dynamicRef') = 'string'
            AND length(enum_config ->> 'dynamicRef') > 0
        )
    );

-- static source requires non-empty values array
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_enum_config_static_values;
ALTER TABLE meta.field ADD CONSTRAINT chk_enum_config_static_values
    CHECK (
        enum_config IS NULL
        OR (enum_config ->> 'source') = 'dynamic'
        OR (
            enum_config ? 'values'
            AND jsonb_typeof(enum_config -> 'values') = 'array'
            AND jsonb_array_length(enum_config -> 'values') > 0
        )
    );

-- ============================================================================
-- 4. json_config validation
-- ============================================================================

-- mode must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_json_config_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_json_config_mode
    CHECK (
        json_config IS NULL
        OR NOT json_config ? 'mode'
        OR (json_config ->> 'mode') IN ('free', 'schema')
    );

-- schemaRef required when mode=schema
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_json_config_schema_ref;
ALTER TABLE meta.field ADD CONSTRAINT chk_json_config_schema_ref
    CHECK (
        json_config IS NULL
        OR NOT json_config ? 'mode'
        OR (json_config ->> 'mode') != 'schema'
        OR (
            json_config ? 'schemaRef'
            AND jsonb_typeof(json_config -> 'schemaRef') = 'string'
            AND length(json_config ->> 'schemaRef') > 0
        )
    );

-- json_config only valid for json data type
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_json_config_data_type;
ALTER TABLE meta.field ADD CONSTRAINT chk_json_config_data_type
    CHECK (
        json_config IS NULL
        OR data_type IN ('json', 'jsonb')
    );

-- ============================================================================
-- 5. ui_hint validation (key structure)
-- ============================================================================
-- ui_hint is the most flexible config — validate key types rather than
-- key presence, since it's intentionally extensible via props.

-- type/viewType/editType must be strings when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_ui_hint_type_strings;
ALTER TABLE meta.field ADD CONSTRAINT chk_ui_hint_type_strings
    CHECK (
        ui_hint IS NULL
        OR (
            (NOT ui_hint ? 'type'     OR jsonb_typeof(ui_hint -> 'type')     = 'string')
            AND (NOT ui_hint ? 'viewType' OR jsonb_typeof(ui_hint -> 'viewType') = 'string')
            AND (NOT ui_hint ? 'editType' OR jsonb_typeof(ui_hint -> 'editType') = 'string')
        )
    );

-- boolean flags must be boolean when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_ui_hint_booleans;
ALTER TABLE meta.field ADD CONSTRAINT chk_ui_hint_booleans
    CHECK (
        ui_hint IS NULL
        OR (
            (NOT ui_hint ? 'hidden'    OR jsonb_typeof(ui_hint -> 'hidden')    = 'boolean')
            AND (NOT ui_hint ? 'disabled'  OR jsonb_typeof(ui_hint -> 'disabled')  = 'boolean')
            AND (NOT ui_hint ? 'readOnly'  OR jsonb_typeof(ui_hint -> 'readOnly')  = 'boolean')
            AND (NOT ui_hint ? 'lockOnEdit' OR jsonb_typeof(ui_hint -> 'lockOnEdit') = 'boolean')
        )
    );

-- string fields must be strings when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_ui_hint_strings;
ALTER TABLE meta.field ADD CONSTRAINT chk_ui_hint_strings
    CHECK (
        ui_hint IS NULL
        OR (
            (NOT ui_hint ? 'placeholder' OR jsonb_typeof(ui_hint -> 'placeholder') = 'string')
            AND (NOT ui_hint ? 'helpText'    OR jsonb_typeof(ui_hint -> 'helpText')    = 'string')
            AND (NOT ui_hint ? 'section'     OR jsonb_typeof(ui_hint -> 'section')     = 'string')
            AND (NOT ui_hint ? 'icon'        OR jsonb_typeof(ui_hint -> 'icon')        = 'string')
            AND (NOT ui_hint ? 'group'       OR jsonb_typeof(ui_hint -> 'group')       = 'string')
        )
    );

-- density must be a known value when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_ui_hint_density;
ALTER TABLE meta.field ADD CONSTRAINT chk_ui_hint_density
    CHECK (
        ui_hint IS NULL
        OR NOT ui_hint ? 'density'
        OR (ui_hint ->> 'density') IN ('compact', 'default', 'comfortable')
    );

-- layout must be object when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_ui_hint_layout;
ALTER TABLE meta.field ADD CONSTRAINT chk_ui_hint_layout
    CHECK (
        ui_hint IS NULL
        OR NOT ui_hint ? 'layout'
        OR jsonb_typeof(ui_hint -> 'layout') = 'object'
    );

-- props must be object when present
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_ui_hint_props;
ALTER TABLE meta.field ADD CONSTRAINT chk_ui_hint_props
    CHECK (
        ui_hint IS NULL
        OR NOT ui_hint ? 'props'
        OR jsonb_typeof(ui_hint -> 'props') = 'object'
    );

-- ============================================================================
-- 6. is_sortable / is_aggregatable type compatibility
-- ============================================================================
-- Catches clearly invalid capability flags at the DB level.

-- json fields should not be sortable (no natural ordering)
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_sortable_type_compat;
ALTER TABLE meta.field ADD CONSTRAINT chk_sortable_type_compat
    CHECK (
        is_sortable = false
        OR data_type NOT IN ('json', 'jsonb', 'rich_text')
    );

-- json/boolean/rich_text should not be aggregatable
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_aggregatable_type_compat;
ALTER TABLE meta.field ADD CONSTRAINT chk_aggregatable_type_compat
    CHECK (
        is_aggregatable = false
        OR data_type NOT IN ('json', 'jsonb', 'rich_text', 'boolean')
    );

-- ============================================================================
-- 7. Column comment updates
-- ============================================================================

COMMENT ON COLUMN meta.field.money_config IS
  'Money config (DB-constrained): { currencyMode: "fixed"|"rowField"|"tenantDefault" (required), currencyField (required for rowField), fixedCurrency (required for fixed, 3-char ISO), roundingMode: "HALF_UP"|"HALF_EVEN"|"DOWN"|"UP", scaleMode: "currency"|"fixed", fixedScale: int>=0, allowNegative: bool }. Only valid on decimal/number/integer fields.';

COMMENT ON COLUMN meta.field.datetime_config IS
  'Datetime config (DB-constrained): { timezoneMode: "tenant"|"user"|"utc" (required) }. Only valid on date/datetime fields.';

COMMENT ON COLUMN meta.field.enum_config IS
  'Enum config (DB-constrained): { values: [{value,label?,description?,color?,icon?,sortOrder?,group?}] (required for static), source: "static"|"dynamic", dynamicRef (required for dynamic), i18nKey }. Static source requires non-empty values array.';

COMMENT ON COLUMN meta.field.json_config IS
  'JSON field config (DB-constrained): { mode: "free"|"schema", schemaRef (required for schema mode) }. Only valid on json data type.';

COMMENT ON COLUMN meta.field.ui_hint IS
  'UI override layer (type-validated): { type, viewType, editType: string; hidden, disabled, readOnly, lockOnEdit: bool; placeholder, helpText, section, icon, group: string; density: "compact"|"default"|"comfortable"; layout, props: object; listColumnWidth, listColumnAlignment }. ADVISORY ONLY — never overrides domain truth.';
