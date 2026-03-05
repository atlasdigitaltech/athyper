-- ============================================================================
-- Meta Field Enhancement: Structured Configs, Semantic Format, and UI Hints
-- ============================================================================
-- Adds new columns to meta.field for the two-layer architecture:
--   Data Type = what it is (storage + validation + API contract)
--   UI Type   = how it's edited/viewed (component + UX behavior)
--
-- All columns are nullable or have safe defaults — fully backward-compatible.
-- Existing rows continue to work; legacy data is normalized at read time.
-- ============================================================================

-- ── Semantic Format & Field Metadata ──

ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS format         text;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS unit           text;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS cardinality    text         NOT NULL DEFAULT 'one';
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS origin         text         NOT NULL DEFAULT 'business';
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS label          text;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS description    text;

-- ── Canonical Constraints ──

ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS constraints    jsonb;

-- ── Structured Configs (replace legacy validation/lookup_config JSONB) ──

ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS enum_config       jsonb;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS reference_config  jsonb;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS json_config       jsonb;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS money_config      jsonb;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS datetime_config   jsonb;

-- ── UI Override Layer ──

ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS ui_hint        jsonb;

-- ── Field Behavior Flags ──

ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS is_read_only   boolean      NOT NULL DEFAULT false;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS is_deprecated  boolean      NOT NULL DEFAULT false;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS is_computed    boolean      NOT NULL DEFAULT false;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS write_once     boolean      NOT NULL DEFAULT false;

-- ── Check Constraints ──

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_cardinality;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_cardinality
    CHECK (cardinality IN ('one', 'many'));

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_origin;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_origin
    CHECK (origin IN ('system', 'business'));

-- ── Column Comments ──

COMMENT ON COLUMN meta.field.format          IS 'Semantic format hint: email, phone, url, money, percent, password, color, etc. Drives UI auto-detect specialization.';
COMMENT ON COLUMN meta.field.unit            IS 'Measurement unit (e.g., kg, hours, meters). Displayed as suffix/prefix in UI.';
COMMENT ON COLUMN meta.field.cardinality     IS 'Field multiplicity: one (scalar) or many (array). Data type is the element type.';
COMMENT ON COLUMN meta.field.origin          IS 'Field origin: system (hidden in business forms) or business (user-defined).';
COMMENT ON COLUMN meta.field.label           IS 'First-class display label for UI. Falls back to humanized column_name if NULL.';
COMMENT ON COLUMN meta.field.description     IS 'First-class field description/help text.';
COMMENT ON COLUMN meta.field.constraints     IS 'Canonical constraints: { nullable, required, min, max, minLength, maxLength, pattern, precision, scale }.';
COMMENT ON COLUMN meta.field.enum_config     IS 'Structured enum: { values: [{value,label,color,icon,group}], source, dynamicRef, i18nKey }.';
COMMENT ON COLUMN meta.field.reference_config IS 'Reference config: { entity, relationshipKind, displayField, searchFields, filter, cacheMode, serverSearchMode, hydrateStrategy, joinEntity/joinLeftKey/joinRightKey for M:N }.';
COMMENT ON COLUMN meta.field.json_config     IS 'JSON field config: { mode: free|schema, schemaRef }.';
COMMENT ON COLUMN meta.field.money_config    IS 'Money config: { currencyMode, currencyField, roundingMode, scaleMode, fixedScale, allowNegative }.';
COMMENT ON COLUMN meta.field.datetime_config IS 'Datetime config: { timezoneMode: tenant|user|utc }.';
COMMENT ON COLUMN meta.field.ui_hint         IS 'UI override layer: { type, viewType, editType, props, hidden, section, layout, density }.';
COMMENT ON COLUMN meta.field.is_read_only    IS 'Field is read-only in all contexts.';
COMMENT ON COLUMN meta.field.is_deprecated   IS 'Field is deprecated — shown with warning, may be hidden in new forms.';
COMMENT ON COLUMN meta.field.is_computed     IS 'Field is computed/derived — always read-only, value set by server.';
COMMENT ON COLUMN meta.field.write_once      IS 'Field can only be set on creation — locked after first save.';
