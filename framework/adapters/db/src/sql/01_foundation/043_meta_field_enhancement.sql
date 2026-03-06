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

-- ── Context-Aware Visibility & Editability (FR-4) ──
-- Per-context visibility: { create: "visible"|"hidden"|"internal", view: ..., edit: ... }
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS visibility     jsonb;
-- Per-context editability: { create: "editable"|"read_only"|"system_managed"|"computed", edit: ... }
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS editability    jsonb;

-- ── List Page Capabilities (FR-8) ──
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS is_sortable    boolean      NOT NULL DEFAULT false;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS is_groupable   boolean      NOT NULL DEFAULT false;
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS is_aggregatable boolean     NOT NULL DEFAULT false;

-- ── Computed Field Wiring (FR-9) ──
-- virtual = computed at read time; materialized = stored and recomputed on write/job
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS compute_mode   text;
-- Expression referencing same-record fields, related collections, or system context
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS compute_expr   jsonb;

-- ── Collection (many) Field Wiring — Option B: Join Table (FR-3) ──
-- Logical child entity name (e.g., "invoice_line")
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS child_entity_name  text;
-- Parent FK field on child table (e.g., "invoice_id")
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS child_fk_field     text;
-- Collection behavior: ordering, UI editor style, cascade rules
ALTER TABLE meta.field ADD COLUMN IF NOT EXISTS collection_behavior jsonb;

-- ── Check Constraints ──

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_cardinality;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_cardinality
    CHECK (cardinality IN ('one', 'many'));

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_origin;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_origin
    CHECK (origin IN ('system', 'business'));

ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_compute_mode;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_compute_mode
    CHECK (compute_mode IS NULL OR compute_mode IN ('virtual', 'materialized'));

-- Ensure collection wiring is present when cardinality = 'many'
-- (advisory — enforced at application layer too, but constraint catches bad inserts)
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_many_wiring;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_many_wiring
    CHECK (
        cardinality = 'one'
        OR (cardinality = 'many' AND child_entity_name IS NOT NULL AND child_fk_field IS NOT NULL)
    );

-- Ensure computed fields have expression+mode, and non-computed fields don't have stale wiring
ALTER TABLE meta.field DROP CONSTRAINT IF EXISTS chk_field_computed_expr;
ALTER TABLE meta.field ADD CONSTRAINT chk_field_computed_expr
    CHECK (
        (is_computed = false AND compute_mode IS NULL AND compute_expr IS NULL)
        OR (is_computed = true AND compute_mode IS NOT NULL AND compute_expr IS NOT NULL)
    );

-- ── Indexes for List Capabilities ──
CREATE INDEX IF NOT EXISTS idx_field_sortable
    ON meta.field (tenant_id, entity_version_id) WHERE is_sortable = true;
CREATE INDEX IF NOT EXISTS idx_field_groupable
    ON meta.field (tenant_id, entity_version_id) WHERE is_groupable = true;
CREATE INDEX IF NOT EXISTS idx_field_aggregatable
    ON meta.field (tenant_id, entity_version_id) WHERE is_aggregatable = true;

-- ── Column Comments ──

COMMENT ON COLUMN meta.field.format          IS 'Semantic format hint: email, phone, url, money, percent, password, color, etc. Drives UI auto-detect specialization.';
COMMENT ON COLUMN meta.field.unit            IS 'Measurement unit (e.g., kg, hours, meters). Displayed as suffix/prefix in UI.';
COMMENT ON COLUMN meta.field.cardinality     IS 'Field multiplicity: one (scalar) or many (collection via child entity). Data type is the element type.';
COMMENT ON COLUMN meta.field.origin          IS 'Field origin: system (hidden in business forms) or business (user-defined).';
COMMENT ON COLUMN meta.field.label           IS 'First-class display label for UI. Falls back to humanized column_name if NULL.';
COMMENT ON COLUMN meta.field.description     IS 'First-class field description/help text.';
COMMENT ON COLUMN meta.field.constraints     IS 'Canonical constraints: { nullable, required, min, max, minLength, maxLength, pattern, precision, scale }.';
COMMENT ON COLUMN meta.field.enum_config     IS 'Structured enum: { values: [{value,label,color,icon,group}], source, dynamicRef, i18nKey }.';
COMMENT ON COLUMN meta.field.reference_config IS 'Reference config: { entity, relationshipKind, displayField, searchFields, filter, cacheMode, serverSearchMode, hydrateStrategy, joinEntity/joinLeftKey/joinRightKey for M:N }.';
COMMENT ON COLUMN meta.field.json_config     IS 'JSON field config: { mode: free|schema, schemaRef }.';
COMMENT ON COLUMN meta.field.money_config    IS 'Money config: { currencyMode, currencyField, roundingMode, scaleMode, fixedScale, allowNegative }.';
COMMENT ON COLUMN meta.field.datetime_config IS 'Datetime config: { timezoneMode: tenant|user|utc }.';
COMMENT ON COLUMN meta.field.ui_hint         IS 'UI override layer: { type, viewType, editType, props, hidden, disabled, placeholder, helpText, section, readOnly, lockOnEdit, layout, density, icon, group, listColumnWidth, listColumnAlignment }.';
COMMENT ON COLUMN meta.field.is_read_only    IS 'Field is read-only in all contexts.';
COMMENT ON COLUMN meta.field.is_deprecated   IS 'Field is deprecated — shown with warning, may be hidden in new forms.';
COMMENT ON COLUMN meta.field.is_computed     IS 'Field is computed/derived — always read-only, value set by server.';
COMMENT ON COLUMN meta.field.write_once      IS 'Field can only be set on creation — locked after first save.';
COMMENT ON COLUMN meta.field.visibility      IS 'Context-aware visibility: { create: visible|hidden|internal, view: ..., edit: ... }. Defaults to visible everywhere if NULL.';
COMMENT ON COLUMN meta.field.editability     IS 'Context-aware editability: { create: editable|read_only|system_managed|computed, edit: ... }. Defaults to editable if NULL.';
COMMENT ON COLUMN meta.field.is_sortable     IS 'Field participates in list-page sorting.';
COMMENT ON COLUMN meta.field.is_groupable    IS 'Field participates in list-page grouping.';
COMMENT ON COLUMN meta.field.is_aggregatable IS 'Field participates in list-page aggregation (count, sum, avg, etc.).';
COMMENT ON COLUMN meta.field.compute_mode    IS 'Computed field mode: virtual (read-time) or materialized (stored, recomputed on write/job).';
COMMENT ON COLUMN meta.field.compute_expr    IS 'Computed field expression: { type: "formula"|"aggregate"|"system", expr, dependsOn[], aggregateOf, aggregateOp }.';
COMMENT ON COLUMN meta.field.child_entity_name  IS 'For cardinality=many: logical child entity name (e.g., "invoice_line").';
COMMENT ON COLUMN meta.field.child_fk_field     IS 'For cardinality=many: parent FK field on child table (e.g., "invoice_id").';
COMMENT ON COLUMN meta.field.collection_behavior IS 'For cardinality=many: { ordering: bool, orderField, editorStyle: grid|subform|tags, cascadeDelete: bool, minItems, maxItems, aggregates: [{field,op}] }.';
