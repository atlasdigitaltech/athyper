-- The single physical-column field generator for control.entity_field.
-- Reads pg_catalog directly because information_schema.columns omits materialized views.
-- Every other contract file may patch an existing field keyed by
-- (entity_version_id, name), or add a computed/projection field with an empty
-- column_name; no other file should discover physical columns.
WITH relation_columns AS (
    SELECT
        n.nspname AS table_schema,
        c.relname AS table_name,
        a.attname AS column_name,
        a.attnum AS ordinal_position,
        CASE
            WHEN t.typcategory = 'A' THEN 'ARRAY'
            WHEN t.typname = 'uuid' THEN 'uuid'
            WHEN t.typname = 'bool' THEN 'boolean'
            WHEN t.typname = 'int2' THEN 'smallint'
            WHEN t.typname = 'int4' THEN 'integer'
            WHEN t.typname = 'int8' THEN 'bigint'
            WHEN t.typname = 'numeric' THEN 'numeric'
            WHEN t.typname = 'float4' THEN 'real'
            WHEN t.typname = 'float8' THEN 'double precision'
            WHEN t.typname = 'date' THEN 'date'
            WHEN t.typname = 'timestamp' THEN 'timestamp without time zone'
            WHEN t.typname = 'timestamptz' THEN 'timestamp with time zone'
            WHEN t.typname = 'json' THEN 'json'
            WHEN t.typname = 'jsonb' THEN 'jsonb'
            WHEN t.typname = 'tsvector' THEN 'tsvector'
            WHEN t.typname IN ('text', 'varchar', 'bpchar', 'name', 'citext') THEN 'text'
            WHEN t.typtype = 'e' THEN 'USER-DEFINED'
            ELSE pg_catalog.format_type(a.atttypid, a.atttypmod)
        END AS data_type,
        t.typname AS udt_name,
        CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
        pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
        CASE WHEN a.attgenerated <> '' THEN 'ALWAYS' ELSE 'NEVER' END AS is_generated
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.oid
     AND a.attnum > 0
     AND NOT a.attisdropped
    JOIN pg_type t
      ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef ad
      ON ad.adrelid = a.attrelid
     AND ad.adnum = a.attnum
    WHERE c.relkind IN ('r', 'p', 'v', 'm')
      AND n.nspname IN (
          'aggregate',
          'control',
          'document',
          'event',
          'governance',
          'ledger',
          'log',
          'master',
          'public',
          'shared',
          'snapshot'
      )
)
INSERT INTO control.entity_field (
    entity_version_id,
    name,
    column_name,
    projection_alias_of,
    label,
    data_type,
    ui_type,
    cardinality,
    origin,
    is_required,
    is_searchable,
    is_filterable,
    is_sortable,
    is_read_only,
    sort_order,
    -- DatePicker v2 temporal semantics. Computed inline from the PG type so
    -- every row lands tagged at INSERT time and the runtime never falls back
    -- to inference. affects_posting_period is true only for the 8 documents
    -- whose `posting_date` column drives document.trg_je_period_gate_fn.
    temporal_kind,
    affects_posting_period,
    created_by
)
SELECT
    ev.id,
    col.column_name,
    col.column_name,
    NULL::text,
    initcap(replace(col.column_name, '_', ' ')),
    CASE
        WHEN col.column_name LIKE '%\_id' ESCAPE '\' THEN 'reference'
        WHEN col.column_name = 'status' THEN 'lifecycle_state'
        WHEN col.data_type = 'uuid' THEN 'uuid'
        WHEN col.data_type = 'boolean'
         AND col.column_name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
            THEN 'boolean'
        WHEN col.data_type = 'boolean' THEN 'string'
        WHEN col.data_type IN ('smallint', 'integer', 'bigint') THEN 'integer'
        WHEN col.data_type IN ('numeric', 'decimal', 'real', 'double precision') THEN 'decimal'
        WHEN col.data_type = 'date' THEN 'date'
        WHEN col.data_type LIKE 'timestamp%' THEN 'datetime'
        WHEN col.data_type IN ('json', 'jsonb') THEN 'json'
        WHEN col.data_type = 'tsvector' THEN 'tsvector'
        WHEN col.data_type = 'ARRAY' AND col.udt_name = '_uuid' THEN 'uuid_array'
        WHEN col.data_type = 'ARRAY' AND col.udt_name IN ('_int2', '_int4', '_int8') THEN 'int_array'
        WHEN col.data_type = 'ARRAY' AND col.udt_name = '_jsonb' THEN 'jsonb_array'
        WHEN col.data_type = 'ARRAY' THEN 'text_array'
        ELSE 'text'
    END,
    CASE
        WHEN col.column_name LIKE '%\_id' ESCAPE '\' THEN 'reference'
        WHEN col.column_name = 'status' THEN 'select'
        WHEN col.data_type = 'boolean'
         AND col.column_name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
            THEN 'toggle'
        WHEN col.data_type IN ('date') THEN 'date'
        WHEN col.data_type LIKE 'timestamp%' THEN 'datetime'
        WHEN col.data_type IN ('json', 'jsonb', 'ARRAY') THEN 'json'
        WHEN col.column_name IN ('description', 'notes', 'metadata') THEN 'textarea'
        ELSE 'text'
    END,
    CASE
        WHEN col.data_type = 'ARRAY' THEN 'many'
        WHEN col.is_nullable = 'YES' THEN 'zero_or_one'
        ELSE 'one'
    END,
    'standard',
    (
        col.is_nullable = 'NO'
        AND col.column_default IS NULL
        AND col.is_generated = 'NEVER'
        AND e.backing_type NOT IN ('view', 'materialized_view')
        AND COALESCE(e.feature_flags ->> 'metadata_coverage_source', '') <> 'governed_schema_coverage'
    ),
    (
        col.data_type IN ('text', 'character varying', 'character')
        AND col.column_name IN ('code', 'name', 'slug', 'document_no', 'number', 'title', 'description')
    ),
    (
        col.column_name IN ('id', 'tenant_id', 'code', 'name', 'status', 'created_at', 'updated_at')
        OR col.column_name LIKE '%\_id' ESCAPE '\'
        OR (
            col.data_type = 'boolean'
            AND col.column_name ~ '^(is_|has_|can_|allow_|enable_|supports_|requires_|override_)'
        )
    ),
    col.data_type NOT IN ('json', 'jsonb', 'ARRAY'),
    (
        e.backing_type IN ('view', 'materialized_view')
        OR COALESCE(e.feature_flags ->> 'metadata_coverage_source', '') = 'governed_schema_coverage'
        OR col.column_name IN ('id', 'tenant_id', 'created_at', 'created_by', 'updated_at', 'updated_by')
        OR col.is_generated <> 'NEVER'
    ),
    LEAST((col.ordinal_position * 10), 32760)::smallint,
    -- temporal_kind: derived from the PG type so every row lands explicitly tagged.
    CASE
        WHEN col.data_type = 'date'                       THEN 'businessDate'
        WHEN col.data_type = 'timestamp with time zone'   THEN 'instant'
        WHEN col.data_type = 'timestamp without time zone' THEN 'instant'
        ELSE NULL
    END,
    -- affects_posting_period: true only when (entity_code, column_name) is one
    -- of the eight (entity, posting_date) pairs that drive the GL posting trigger.
    -- The line-level posting_date fields inherit gating from the header and are
    -- intentionally excluded â€” the trigger only fires on the header insert.
    (
        col.column_name = 'posting_date'
        AND e.entity_code IN (
            'purchase_invoice',
            'journal_entry',
            'payment_entry',
            'intercompany_transaction',
            'ic_elimination',
            'receipt',
            'service_sheet',
            'fx_revaluation_run'
        )
    ),
    '00000000-0000-0000-0000-000000000000'
FROM control.entity e
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.tenant_id IS NULL
 AND ev.status = 'EFFECTIVE'
JOIN relation_columns col
  ON col.table_schema = e.table_schema
 AND col.table_name = e.table_name
WHERE e.tenant_id IS NULL
  AND e.status = 'ACTIVE'
  AND col.column_name ~ '^[a-z][a-z0-9_]*$'
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    ui_type = EXCLUDED.ui_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_required = EXCLUDED.is_required,
    is_searchable = EXCLUDED.is_searchable,
    is_filterable = EXCLUDED.is_filterable,
    is_sortable = EXCLUDED.is_sortable,
    -- Physical discovery is the canonical runtime field authority. Re-enable
    -- the row on reruns without changing metadata registration semantics.
    is_active = true,
    is_deprecated = false,
    runtime_enabled = true,
    temporal_kind = EXCLUDED.temporal_kind,
    affects_posting_period = EXCLUDED.affects_posting_period,
    -- Auto-detection flags id/tenant_id/created_*/updated_* as is_read_only=true,
    -- but downstream seeds (042d / 044 entity_operation) own those columns and
    -- mark them is_write_once=true instead. Both flags true would violate
    -- ef_writeonce_readonly_chk. Yield to the existing write_once authority on
    -- re-runs by skipping the is_read_only overwrite when the row is already
    -- write_once. Fresh-run behaviour is unchanged because the row is new and
    -- inherits the auto-detected value verbatim.
    is_read_only = CASE
        WHEN entity_field.is_write_once THEN entity_field.is_read_only
        ELSE EXCLUDED.is_read_only
    END,
    projection_alias_of = COALESCE(entity_field.projection_alias_of, EXCLUDED.projection_alias_of),
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
    is_read_only, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, f.origin, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
       f.is_read_only, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('id',          'id',          'ID',          'uuid',            'hidden',   'one', 'system',   true,  false, false, false, true,   10),
    ('tenant_id',   'tenant_id',   'Tenant',      'uuid',            'hidden',   'one', 'system',   true,  true,  false, false, true,   20),
    ('code',        'code',        'Code',        'string',          'text',     'one', 'standard', true,  true,  true,  true,  false,  30),
    ('name',        'name',        'Name',        'string',          'text',     'one', 'standard', true,  true,  true,  true,  false,  40),
    ('description', 'description', 'Description', 'text',            'textarea', 'one', 'standard', false, false, false, true,  false,  50),
    ('is_compound', 'is_compound', 'Compound',    'boolean',         'toggle',   'one', 'standard', true,  true,  true,  false, false,  60),
    ('status',      'status',      'Status',      'lifecycle_state', 'select',   'one', 'standard', true,  true,  true,  false, false,  70)
) AS f(name, column_name, label, data_type, ui_type, cardinality, origin,
       is_required, is_filterable, is_sortable, is_searchable, is_read_only, sort_order)
WHERE e.entity_code = 'tax_group' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    ui_type = EXCLUDED.ui_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_sortable = EXCLUDED.is_sortable,
    is_searchable = EXCLUDED.is_searchable,
    is_read_only = EXCLUDED.is_read_only,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- Ã¢â€â‚¬Ã¢â€â‚¬ business_partner_bank_account: entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- View columns exposed for display, filtering, and schema introspection.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('bank_name',           'bank_name',           'Bank Name',      'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  10),
    ('account_number',      'account_number',      'Account Number', 'text',    'one',         NULL::text, true,  true,  NULL::jsonb,  20),
    ('currency_code',       'currency_code',       'Currency',       'text',    'one',         NULL::text, true,  true,  NULL::jsonb,  30),
    ('account_holder_name', 'account_holder_name', 'Account Holder', 'text',    'zero_or_one', NULL::text, false, false, NULL::jsonb,  40),
    ('account_id_type',     'account_id_type',     'Account Type',   'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  50),
    ('account_nature',      'account_nature',      'Nature',         'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  60),
    ('is_verified',         'is_verified',         'Verified',       'boolean', 'one',         NULL::text, true,  true,  NULL::jsonb,  70),
    ('purpose',             'purpose',             'Purpose',        'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  80),
    ('is_primary',          'is_primary',          'Primary',        'boolean', 'one',         NULL::text, true,  true,  NULL::jsonb,  90),
    ('effective_from',      'effective_from',      'Effective From', 'date',    'zero_or_one', NULL::text, false, true,  NULL::jsonb, 100),
    ('effective_until',     'effective_until',     'Expires',        'date',    'zero_or_one', NULL::text, false, true,  NULL::jsonb, 110),
    ('bic_override',        'bic_override',        'BIC / SWIFT',    'text',    'zero_or_one', NULL::text, false, false, NULL::jsonb, 120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'v_business_partner_bank_account' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- 3. control.entity_field Ã¢â‚¬â€ request_scope
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
    'request_scope', 'request_scope', 'Change Categories', 'enum',
    'many', 'system', 'document.upupr_request_scope', true, true,
    '{"min_items":1,"trigger":"on_submit"}'::jsonb,
    9, '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- 4. control.entity_field Ã¢â‚¬â€ change_reason
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, is_required,
    validation, sort_order, created_by)
SELECT ev.id,
    'change_reason', 'change_reason', 'Reason for Change', 'text',
    'zero_or_one', 'system', false,
    '{"required_when":{"field":"request_scope","operator":"contains_any","values":["iam_group","ou_assignment"]},"trigger":"on_submit"}'::jsonb,
    10, '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document' AND e.table_name = 'user_profile_update_request'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_required = EXCLUDED.is_required,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
    is_read_only, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, f.origin, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
       f.is_read_only, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('id',             'id',             'ID',              'uuid',            'hidden',   'one',         'system',   true,  false, false, false, true,   10),
    ('tenant_id',      'tenant_id',      'Tenant',          'uuid',            'hidden',   'one',         'system',   true,  true,  false, false, true,   20),
    ('code',           'code',           'Code',            'string',          'text',     'one',         'standard', true,  true,  true,  true,  false,  30),
    ('name',           'name',           'Name',            'string',          'text',     'one',         'standard', true,  true,  true,  true,  false,  40),
    ('description',    'description',    'Description',     'text',            'textarea', 'zero_or_one', 'standard', false, false, false, true,  false,  50),
    ('direction',      'direction',      'Direction',       'string',          'select',   'one',         'standard', true,  true,  true,  false, false,  60),
    ('subledger_type', 'subledger_type', 'Subledger Type',  'string',          'select',   'one',         'standard', true,  true,  true,  false, false,  70),
    ('domain_hint',    'domain_hint',    'Domain',          'string',          'text',     'zero_or_one', 'standard', false, true,  true,  false, false,  80),
    ('icon_key',       'icon_key',       'Icon',            'string',          'text',     'zero_or_one', 'standard', false, false, false, false, false,  85),
    ('color_token',    'color_token',    'Color',           'string',          'text',     'zero_or_one', 'standard', false, false, false, false, false,  86),
    ('sort_order',     'sort_order',     'Sort Order',      'integer',         'number',   'one',         'standard', true,  false, true,  false, false,  87),
    ('metadata',       'metadata',       'Metadata',        'jsonb',           'json',     'one',         'system',   true,  false, false, false, false,  88),
    ('status',         'status',         'Status',          'lifecycle_state', 'select',   'one',         'standard', true,  true,  true,  false, false,  90),
    ('is_active',      'is_active',      'Active',          'boolean',         'checkbox', 'one',         'system',   true,  true,  true,  false, true,  100),
    ('status_changed_at','status_changed_at','Status Changed At','timestamptz','datetime','zero_or_one', 'system',   false, false, true,  false, true,  110),
    ('status_changed_by','status_changed_by','Status Changed By','uuid',       'hidden',   'zero_or_one', 'system',   false, false, false, false, true,  120),
    ('created_at',     'created_at',     'Created At',      'timestamptz',     'datetime', 'one',         'system',   true,  false, true,  false, true,  130),
    ('created_by',     'created_by',     'Created By',      'uuid',            'hidden',   'one',         'system',   true,  false, false, false, true,  140),
    ('updated_at',     'updated_at',     'Updated At',      'timestamptz',     'datetime', 'zero_or_one', 'system',   false, false, true,  false, true,  150),
    ('updated_by',     'updated_by',     'Updated By',      'uuid',            'hidden',   'zero_or_one', 'system',   false, false, false, false, true,  160)
) AS f(name, column_name, label, data_type, ui_type, cardinality, origin,
       is_required, is_filterable, is_sortable, is_searchable, is_read_only, sort_order)
WHERE e.entity_code = 'accounting_profile' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    ui_type = EXCLUDED.ui_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_sortable = EXCLUDED.is_sortable,
    is_searchable = EXCLUDED.is_searchable,
    is_read_only = EXCLUDED.is_read_only,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- Seed: ~15 canonical field dictionary rows
-- entity_version_id IS NULL = global canonical field (cross-entity)
-- CHECK constraint ef_canonical_tenant_chk: canonical fields must have tenant_id IS NULL
-- Partial UNIQUE index ef_canonical_name_uidx: UNIQUE(name) WHERE entity_version_id IS NULL
-- Idempotent: ON CONFLICT DO UPDATE (via index)

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO control.entity_field (
    tenant_id, entity_version_id,
    name, column_name, label, description,
    data_type, ui_type, cardinality, origin,
    is_required, is_unique, is_searchable, is_filterable, is_sortable,
    is_read_only, is_write_once,
    applies_to_classes, is_required_default, is_filterable_default,
    sort_order, created_by
) VALUES

    -- Ã¢â€â‚¬Ã¢â€â‚¬ System identity Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    (NULL, NULL,
     'id', 'id', 'ID', 'Primary key (UUIDv7)',
     'uuid', 'hidden', 'one', 'system',
     true, true, false, false, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION,AGGREGATE}',
     true, false,
     10, v_su),

    (NULL, NULL,
     'tenant_id', 'tenant_id', 'Tenant', 'Owning tenant reference',
     'uuid', 'hidden', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,RELATION,LOG,DIMENSION}',
     true, true,
     20, v_su),

    -- Ã¢â€â‚¬Ã¢â€â‚¬ Standard identity Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    (NULL, NULL,
     'code', 'code', 'Code', 'Unique business code / slug',
     'string', 'text', 'one', 'standard',
     true, true, true, true, true,
     false, false,
     '{MASTER,REFERENCE,DIMENSION}',
     true, true,
     30, v_su),

    (NULL, NULL,
     'name', 'name', 'Name', 'Display name',
     'string', 'text', 'one', 'standard',
     true, false, true, true, true,
     false, false,
     '{MASTER,REFERENCE,DIMENSION}',
     true, true,
     40, v_su),

    (NULL, NULL,
     'description', 'description', 'Description', 'Detailed description',
     'text', 'textarea', 'one', 'standard',
     false, false, true, false, false,
     false, false,
     '{MASTER,CONTROL,REFERENCE,DIMENSION}',
     false, false,
     50, v_su),

    -- Ã¢â€â‚¬Ã¢â€â‚¬ Lifecycle / Status Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    (NULL, NULL,
     'status', 'status', 'Status', 'Lifecycle status code',
     'string', 'status', 'one', 'system',
     true, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,REFERENCE,DIMENSION}',
     true, true,
     900, v_su),

    (NULL, NULL,
     'is_active', 'is_active', 'Active', 'Computed active flag (status = active or ACTIVE)',
     'boolean', 'hidden', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,REFERENCE,DIMENSION}',
     true, true,
     910, v_su),

    (NULL, NULL,
     'status_changed_at', 'status_changed_at', 'Status Changed', 'Timestamp of last status change',
     'timestamp', 'datetime', 'one', 'system',
     false, false, false, true, true,
     true, false,
     '{MASTER,DOCUMENT}',
     false, false,
     920, v_su),

    (NULL, NULL,
     'status_changed_by', 'status_changed_by', 'Status Changed By', 'Actor who last changed status',
     'uuid', 'reference', 'one', 'system',
     false, false, false, false, false,
     true, false,
     '{MASTER,DOCUMENT}',
     false, false,
     925, v_su),

    -- Ã¢â€â‚¬Ã¢â€â‚¬ Metadata Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    (NULL, NULL,
     'metadata', 'metadata', 'Metadata', 'Extensible JSONB metadata bag',
     'json', 'json-editor', 'one', 'system',
     false, false, false, false, false,
     false, false,
     '{MASTER,CONTROL,DOCUMENT,DIMENSION}',
     false, false,
     930, v_su),

    (NULL, NULL,
     'tags', 'tags', 'Tags', 'JSONB string-array of user-defined tags',
     'json', 'tag-input', 'many', 'system',
     false, false, true, true, false,
     false, false,
     '{MASTER,DOCUMENT}',
     false, false,
     935, v_su),

    -- Ã¢â€â‚¬Ã¢â€â‚¬ Audit trail Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    (NULL, NULL,
     'created_at', 'created_at', 'Created', 'Row creation timestamp',
     'timestamp', 'datetime', 'one', 'system',
     true, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION,AGGREGATE}',
     true, true,
     950, v_su),

    (NULL, NULL,
     'created_by', 'created_by', 'Created By', 'Actor UUID who created the row',
     'uuid', 'reference', 'one', 'system',
     true, false, false, true, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT,DOCUMENT_RELATION,REFERENCE,RELATION,LOG,DIMENSION}',
     true, false,
     960, v_su),

    (NULL, NULL,
     'updated_at', 'updated_at', 'Updated', 'Timestamp of last update',
     'timestamp', 'datetime', 'one', 'system',
     false, false, false, true, true,
     true, false,
     '{MASTER,CONTROL,DOCUMENT}',
     false, false,
     970, v_su),

    (NULL, NULL,
     'updated_by', 'updated_by', 'Updated By', 'Actor UUID who last updated',
     'uuid', 'reference', 'one', 'system',
     false, false, false, false, false,
     true, false,
     '{MASTER,CONTROL,DOCUMENT}',
     false, false,
     980, v_su)

ON CONFLICT (name) WHERE entity_version_id IS NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    data_type = EXCLUDED.data_type,
    ui_type = EXCLUDED.ui_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_required = EXCLUDED.is_required,
    is_unique = EXCLUDED.is_unique,
    is_searchable = EXCLUDED.is_searchable,
    is_filterable = EXCLUDED.is_filterable,
    is_sortable = EXCLUDED.is_sortable,
    is_read_only = EXCLUDED.is_read_only,
    is_write_once = EXCLUDED.is_write_once,
    applies_to_classes = EXCLUDED.applies_to_classes,
    is_required_default = EXCLUDED.is_required_default,
    is_filterable_default = EXCLUDED.is_filterable_default,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

RAISE NOTICE 'control.entity_field: canonical dictionary seeded (% rows if first run)',
    (SELECT count(*) FROM control.entity_field WHERE entity_version_id IS NULL);

END $$;


-- Repair two classes of bad entity_field rows from earlier seeds:
--   1. payment_term_id ref_entity was seeded as plural 'payment_terms' â†’ 404 on detail page.
--   2. Common-field seeds added name/code/description to MASTER junction tables
--      that lack those columns â†’ listHandler ORDER BY "name" 500.
DO $$
DECLARE
  updated int;
  deleted int;
BEGIN

  UPDATE control.entity_field ef
     SET validation = jsonb_set(ef.validation, '{ref_entity}', '"payment_term"')
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE ef.entity_version_id = ev.id
     AND e.table_schema  = 'document'
     AND e.table_name    = 'purchase_invoice'
     AND e.tenant_id    IS NULL
     AND ef.name         = 'payment_term_id'
     AND ef.tenant_id   IS NULL
     AND ef.validation->>'ref_entity' = 'payment_terms';

  GET DIAGNOSTICS updated = ROW_COUNT;
  RAISE NOTICE 'payment_term_id ref_entity corrected (% rows updated)', updated;

  UPDATE control.entity_field ef
     SET runtime_enabled = false,
         updated_at = now(),
         updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN  control.entity e ON e.id = ev.entity_id
  WHERE ef.entity_version_id = ev.id
    AND ef.name        IN ('name', 'code', 'description')
    AND ef.tenant_id   IS NULL
    AND ef.origin       = 'standard'
    AND NOT EXISTS (
      SELECT 1
        FROM information_schema.columns ic
       WHERE ic.table_schema = e.table_schema
         AND ic.table_name   = e.table_name
         AND ic.column_name  = ef.column_name
    );

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RAISE NOTICE 'removed % spurious name/code/description entity_field rows', deleted;

END $$;


INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('code',                       'code',                       'BP Code',                  'text',          'one',         NULL::text,                          true,  true,  '{"max_length":30}'::jsonb,  10),
    ('name',                       'name',                       'Name',                     'text',          'one',         NULL::text,                          true,  true,  '{"max_length":255}'::jsonb, 20),
    ('display_name',               'display_name',               'Display Name',             'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":255}'::jsonb, 30),
    ('partner_category',           'partner_category',           'Category',                 'enum',          'one',         'master.business_partner_category',  true,  true,  NULL::jsonb,                 40),
    ('legal_name',                 'legal_name',                 'Legal Name',               'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":255}'::jsonb, 50),
    ('legal_form',                 'legal_form',                 'Legal Form',               'enum',          'zero_or_one', 'master.legal_form',                  false, true,  '{"max_length":100}'::jsonb, 72),
    ('registration_no',            'registration_no',            'Registration No.',         'text',          'zero_or_one', NULL::text,                          false, true,  '{"max_length":100}'::jsonb, 60),
    ('registration_country_code',  'registration_country_code',  'Registration Country',     'text',          'zero_or_one', NULL::text,                          false, true,  '{"max_length":3}'::jsonb,   70),
    ('tax_residence_country_code', 'tax_residence_country_code', 'Tax Residence Country',    'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":3}'::jsonb,   75),
    ('website_url',                'website_url',                'Website',                  'text',          'zero_or_one', NULL::text,                          false, false, '{"format":"url"}'::jsonb,   80),
    ('parent_business_partner_id', 'parent_business_partner_id', 'Parent Business Partner',   'uuid',          'zero_or_one', NULL::text,                          false, true,  '{"ref_entity":"business_partner"}'::jsonb, 85),
    ('description',                'description',                'Description',              'text',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 90),
    ('aliases',                    'aliases',                    'Aliases',                  'text_array',    'many',        NULL::text,                          false, false, NULL::jsonb,                100),
    ('tags',                       'tags',                       'Tags',                     'jsonb',         'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                110),
    ('business_types',             'business_types',             'Business Types',           'text_array',    'many',        NULL::text,                          false, false, NULL::jsonb,                120),
    ('founded_year',               'founded_year',               'Founded Year',             'integer',       'zero_or_one', NULL::text,                          false, false, '{"min":1800,"max":2100}'::jsonb, 130),
    ('employee_count_band',        'employee_count_band',        'Employee Count',           'enum',          'zero_or_one', 'master.employee_count_band',        false, false, NULL::jsonb,                140),
    ('annual_revenue_band',        'annual_revenue_band',        'Annual Revenue Band',      'enum',          'zero_or_one', 'master.annual_revenue_band',        false, false, NULL::jsonb,                150),
    ('status',                     'status',                     'Status',                   'lifecycle_state','one',        NULL::text,                          true,  true,  NULL::jsonb,                200),
    ('external_ref',               'external_ref',               'External Reference',       'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":100}'::jsonb, 210),
    ('long_description',           'long_description',           'Long Description',         'text',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 95),
    ('incorporation_date',         'incorporation_date',         'Incorporation Date',        'date',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 77),
    ('effective_from',             'effective_from',             'Effective From',            'date',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 82),
    ('effective_until',            'effective_until',            'Effective Until',           'date',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 84),
    ('metadata',                   'metadata',                   'Metadata',                  'jsonb',         'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                220)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
 WHERE e.entity_code = 'business_partner'
   AND e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- BP meta-list projection fields. These are sourced from
-- master.v_business_partner_app_index for list/search only; detail and writes
-- still use the canonical master.business_partner table.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    is_searchable, validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       NULL::jsonb, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('role_summary',        'role_summary',        'Roles',           'text',            'one',         NULL::text,                   true,  true,  true,   35),
    ('role_count',          'role_count',          'Role Count',      'integer',         'one',         NULL::text,                   true,  true,  false,  36),
    ('role_kinds',          'role_kinds',          'Role Kinds',      'text_array',      'many',        NULL::text,                   false, true,  true,   37),
    ('role_codes',          'role_codes',          'Role Codes',      'text',            'zero_or_one', NULL::text,                   false, true,  true,   38),
    ('has_supplier_role',   'has_supplier_role',   'Supplier',        'boolean',         'one',         NULL::text,                   true,  true,  false,  39),
    ('has_customer_role',   'has_customer_role',   'Customer',        'boolean',         'one',         NULL::text,                   true,  true,  false,  40),
    ('is_dual_role',        'is_dual_role',        'Dual Role',       'boolean',         'one',         NULL::text,                   true,  true,  false,  41),
    ('supplier_code',       'supplier_code',       'Supplier Code',   'text',            'zero_or_one', NULL::text,                   false, true,  true,  170),
    ('supplier_status',     'supplier_status',     'Supplier Status', 'lifecycle_state', 'zero_or_one', NULL::text,                   false, true,  false, 171),
    ('is_payment_ready',    'is_payment_ready',    'Payment Ready',   'boolean',         'zero_or_one', NULL::text,                   false, true,  false, 172),
    ('customer_code',       'customer_code',       'Customer Code',   'text',            'zero_or_one', NULL::text,                   false, true,  true,  180),
    ('customer_status',     'customer_status',     'Customer Status', 'lifecycle_state', 'zero_or_one', NULL::text,                   false, true,  false, 181),
    ('is_key_account',      'is_key_account',      'Key Account',     'boolean',         'zero_or_one', NULL::text,                   false, true,  false, 182),
    ('risk_rating',         'risk_rating',         'Risk Rating',     'enum',            'zero_or_one', 'master.credit_rating'::text, false, true,  false, 183),
    ('company_scope_count', 'company_scope_count', 'Company Scopes',  'integer',         'one',         NULL::text,                   true,  true,  false, 184),
    ('active_scope_count',  'active_scope_count',  'Active Scopes',   'integer',         'one',         NULL::text,                   true,  true,  false, 185),
    ('blocked_scope_count', 'blocked_scope_count', 'Blocked Scopes',  'integer',         'one',         NULL::text,                   true,  true,  false, 186),
    ('is_blocked',          'is_blocked',          'Blocked',         'boolean',         'one',         NULL::text,                   true,  true,  false, 187),
    ('search_text',         'search_text',         'Search',          'text',            'one',         NULL::text,                   true,  false, true,  900)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, sort_order)
WHERE e.entity_code = 'v_business_partner_app_index'
  AND e.table_schema = 'master' AND e.table_name = 'v_business_partner_app_index'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Upgrade legal_form to enum (master.legal_form) if previously text Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field
SET data_type        = 'enum',
    enum_domain_code = 'master.legal_form'
WHERE id IN (
    SELECT ef.id
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ef.entity_version_id = ev.id
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.entity_code = 'business_partner'
      AND e.table_schema = 'master' AND e.table_name = 'business_partner'
      AND e.tenant_id IS NULL AND ev.version_no = 1
      AND ef.name = 'legal_form'
      AND (ef.data_type IS DISTINCT FROM 'enum'
           OR ef.enum_domain_code IS DISTINCT FROM 'master.legal_form')
);



UPDATE control.entity_field
SET data_type   = sub.data_type,
    cardinality = sub.cardinality,
    ui_type     = COALESCE(sub.ui_type, control.entity_field.ui_type),
    sort_order  = sub.sort_order,
    reference_config = CASE
        WHEN sub.name = 'parent_business_partner_id'
        THEN '{"target_entity":"business_partner","display_field":"name"}'::jsonb
        ELSE control.entity_field.reference_config
    END
FROM (
    SELECT ef.id,
           f.name,
           f.data_type,
           f.cardinality,
           f.ui_type,
           f.sort_order
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ef.entity_version_id = ev.id
    JOIN control.entity e          ON e.id = ev.entity_id
    JOIN (VALUES
        ('registration_country_code',  'text',       'zero_or_one', 'country'::text,   70),
        ('legal_form',                 'enum',       'zero_or_one', NULL::text,        72),
        ('tax_residence_country_code', 'text',       'zero_or_one', 'country'::text,   75),
        ('parent_business_partner_id', 'uuid',       'zero_or_one', 'reference'::text, 85),
        ('aliases',                    'text_array', 'many',        NULL::text,        100),
        ('tags',                       'jsonb',      'zero_or_one', NULL::text,        110),
        ('business_types',             'text_array', 'many',        NULL::text,        120),
        ('incorporation_date',         'date',       'zero_or_one', NULL::text,        155),
        ('effective_from',             'date',       'zero_or_one', NULL::text,        160),
        ('effective_until',            'date',       'zero_or_one', NULL::text,        165),
        ('metadata',                   'jsonb',      'zero_or_one', NULL::text,        220)
    ) AS f(name, data_type, cardinality, ui_type, sort_order) ON ef.name = f.name
    WHERE e.table_schema = 'master' AND e.table_name = 'business_partner'
      AND e.tenant_id IS NULL AND ev.version_no = 1
) AS sub
WHERE control.entity_field.id = sub.id;



UPDATE control.entity_field ef
SET is_read_only = CASE
    WHEN ef.name IN ('code', 'status', 'metadata') THEN true
    ELSE false
END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin <> 'system'
  AND ef.is_read_only IS DISTINCT FROM CASE
      WHEN ef.name IN ('code', 'status', 'metadata') THEN true
      ELSE false
  END;



INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', NULL::text,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('provider_code',              'provider_code',              'Provider',                  'text',        'one',         true,  true,  '{"max_length":80}'::jsonb,  10),
    ('network_account_code',        'network_account_id',         'Network Account',           'text',        'one',         true,  true,  NULL::jsonb,                 20),
    ('external_party_code',         'external_party_id',          'External Party',            'text',        'zero_or_one', false, true,  NULL::jsonb,                 30),
    ('remote_tenant_id',           'remote_tenant_id',           'Remote Tenant',             'uuid',        'zero_or_one', false, false, NULL::jsonb,                 40),
    ('remote_business_partner_id', 'remote_business_partner_id', 'Remote Business Partner',   'uuid',        'zero_or_one', false, false, NULL::jsonb,                 50),
    ('connection_status',          'connection_status',          'Connection Status',         'text',        'one',         true,  true,  NULL::jsonb,                 60),
    ('verification_status',        'verification_status',        'Verification Status',       'text',        'one',         true,  true,  NULL::jsonb,                 70),
    ('match_confidence',           'match_confidence',           'Match Confidence',          'numeric',     'zero_or_one', false, false, '{"min":0,"max":100}'::jsonb,80),
    ('sync_status',                'sync_status',                'Sync Status',               'text',        'one',         true,  true,  NULL::jsonb,                 90),
    ('last_synced_at',             'last_synced_at',             'Last Synced At',            'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                100),
    ('invited_at',                 'invited_at',                 'Invited At',                'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                110),
    ('connected_at',               'connected_at',               'Connected At',              'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                120),
    ('invitation_expires_at',      'invitation_expires_at',      'Invitation Expires At',     'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                130),
    ('invitation_message',         'invitation_message',         'Invitation Message',        'text',        'zero_or_one', false, false, NULL::jsonb,                140),
    ('network_snapshot',           'network_snapshot',           'Network Snapshot',          'jsonb',       'zero_or_one', false, false, NULL::jsonb,                150),
    ('metadata',                   'metadata',                   'Metadata',                  'jsonb',       'zero_or_one', false, false, NULL::jsonb,                160)
) AS f(name, column_name, label, data_type, cardinality,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET origin = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id', 'business_partner_id', 'created_by', 'updated_by')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');



UPDATE control.entity_field ef
SET is_read_only = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin <> 'system'
  AND ef.is_read_only IS DISTINCT FROM true;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Pin id/tenant_id as system/hidden Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');



-- Filter drawer metadata. The runtime reads entity.display_config.filter_bar
-- and per-field entity_field.ui_hint->'filter'. Meta Studio can later edit
-- these JSON values without changing the UI runtime.
DO $filters$
DECLARE
    v_ev uuid;
BEGIN
    SELECT ev.id
    INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.table_schema = 'master'
      AND e.table_name = 'business_partner'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        UPDATE control.entity_field ef
        SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
            || jsonb_build_object(
                'group_key', f.section_key,
                'filter', f.filter_hint
            )
        FROM (VALUES
            ('status', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','facet_multi_select','quick_filter',true,'quick_label','Status','quick_order',30)),
            ('partner_category', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','facet_multi_select','quick_filter',false)),
            ('role_summary', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','facet_multi_select','quick_filter',true,'quick_label','Role','quick_order',25)),
            ('has_supplier_role', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','boolean','quick_filter',false)),
            ('has_customer_role', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','boolean','quick_filter',false)),
            ('is_dual_role', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','boolean','quick_filter',false)),
            ('code', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('name', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('registration_no', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('external_ref', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('registration_country_code', 'geography', jsonb_build_object(
                'section_key','geography','section_label','Geography','section_order',30,
                'control_type','facet_multi_select','quick_filter',true,'quick_label','Country','quick_order',50)),
            ('tax_residence_country_code', 'geography', jsonb_build_object(
                'section_key','geography','section_label','Geography','section_order',30,
                'control_type','facet_multi_select','quick_filter',false)),
            ('legal_form', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','facet_multi_select','quick_filter',false)),
            ('founded_year', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','number_range','quick_filter',false)),
            ('employee_count_band', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','facet_multi_select','quick_filter',false)),
            ('annual_revenue_band', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','facet_multi_select','quick_filter',false))
        ) AS f(name, section_key, filter_hint)
        WHERE ef.entity_version_id = v_ev
          AND ef.name = f.name;
    END IF;

    UPDATE control.entity
    SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'filter_bar', jsonb_build_object(
            'quick_filters', jsonb_build_array(
                jsonb_build_object('key','__bookmarked','label','Favourites','value',true,'sort_order',10),
                jsonb_build_object('key','__created_by','label','My documents','value','me','sort_order',20),
                jsonb_build_object('key','role.supplier','field','has_supplier_role','label','Suppliers','value',true,'sort_order',30),
                jsonb_build_object('key','role.customer','field','has_customer_role','label','Customers','value',true,'sort_order',40),
                jsonb_build_object('key','role.dual','field','is_dual_role','label','Dual role','value',true,'sort_order',50),
                jsonb_build_object('key','partner_category.organization','field','partner_category','label','Organizations','value','organization','sort_order',60),
                jsonb_build_object('key','partner_category.internal','field','partner_category','label','Internal BPs','value','internal','sort_order',70)
            ),
            'sections', jsonb_build_array(
                jsonb_build_object('key','status_workflow','label','Status & Workflow','sort_order',10),
                jsonb_build_object('key','identification','label','Identification','sort_order',20),
                jsonb_build_object('key','geography','label','Geography','sort_order',30),
                jsonb_build_object('key','general','label','General','sort_order',40)
            )
        )
    )
    WHERE table_schema = 'master'
      AND table_name = 'business_partner'
      AND tenant_id IS NULL;
END $filters$;






-- Ã¢â€â‚¬Ã¢â€â‚¬ 2b. Remove stale field registrations from pre-BP-first schema Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Identity columns (code, name, legal_name, etc.) moved to master.business_partner.
UPDATE control.entity_field ef
   SET runtime_enabled = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev,
      control.entity e
WHERE ef.entity_version_id = ev.id
  AND e.id = ev.entity_id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('code', 'name', 'display_name', 'legal_name', 'legal_form',
                  'tax_number', 'description', 'website_url', 'registration_no',
                  'registration_country_code', 'external_ref', 'long_description',
                  'aliases', 'tags', 'business_types', 'founded_year',
                  'employee_count_band', 'annual_revenue_band');



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â‚¬â€ thin AP role fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- BP-first: identity fields live on master.business_partner.
-- Supplier-role fields are: type, AP defaults, spend classification, status.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_code',  'supplier_code',  'Supplier Code',  'text',           'one',         NULL::text,                          true,  true,  '{"max_length":30}'::jsonb,  10),
    ('supplier_type',  'supplier_type',  'Supplier Type',  'enum',           'zero_or_one', 'master.supplier_type'::text,        false, true,  NULL::jsonb,                 20),
    ('status',         'status',         'Status',         'lifecycle_state','one',         NULL::text,                          true,  true,  NULL::jsonb,                 30)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3b. BP-sourced identity fields (origin='system', read-only in edit mode) Ã¢â€â‚¬Ã¢â€â‚¬
-- These fields live on master.business_partner but are merged into the detail
-- data response by the BP identity merge in records.route.ts.  Registering them
-- here gives the Profile tab renderer the label / data_type it needs to display
-- them.  column_name matches the key that the merge puts in data{}.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       false, false,
       NULL::jsonb, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('name',                      'name',                      'Trading Name',           'text',    'zero_or_one', NULL::text,                100),
    ('display_name',              'display_name',              'Display Name',           'text',    'zero_or_one', NULL::text,                110),
    ('legal_name',                'legal_name',                'Legal Name',             'text',    'zero_or_one', NULL::text,                120),
    ('legal_form',                'legal_form',                'Legal Form',             'enum',    'zero_or_one', 'master.legal_form'::text, 130),
    ('registration_country_code', 'registration_country_code', 'Country of Registration','text',    'zero_or_one', NULL::text,                140),
    ('registration_no',           'registration_no',           'Registration No.',       'text',    'zero_or_one', NULL::text,                150),
    ('tax_residence_country_code','tax_residence_country_code','Tax Residence Country',  'text',    'zero_or_one', NULL::text,                160),
    ('external_ref',              'external_ref',              'External Ref',           'text',    'zero_or_one', NULL::text,                170),
    ('website_url',               'website_url',               'Website',                'text',    'zero_or_one', NULL::text,                200),
    ('description',               'description',               'Description',            'text',    'zero_or_one', NULL::text,                210),
    ('long_description',          'long_description',          'Long Description',       'text',    'zero_or_one', NULL::text,                220),
    ('business_types',            'business_types',            'Business Types',         'text_array', 'zero_or_one', NULL::text,                230),
    ('aliases',                   'aliases',                   'Aliases',                'text_array', 'zero_or_one', NULL::text,                240),
    ('founded_year',              'founded_year',              'Founded Year',           'integer', 'zero_or_one', NULL::text,                250),
    ('employee_count_band',       'employee_count_band',       'Employee Count Band',    'text',    'zero_or_one', NULL::text,                260),
    ('annual_revenue_band',       'annual_revenue_band',       'Annual Revenue Band',    'text',    'zero_or_one', NULL::text,                270)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 4. Set ui_type for country picker Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Tells the EntityForm field-renderer registry to use CountryPicker (AsyncCombobox
-- backed by shared.country lookup domain) instead of a plain text input.
UPDATE control.entity_field ef
SET ui_type = 'country'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('registration_country_code', 'tax_residence_country_code')
  AND ef.ui_type IS DISTINCT FROM 'country';



UPDATE control.entity_field ef
SET data_type = 'enum',
    enum_domain_code = 'master.legal_form'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'legal_form'
  AND (ef.data_type IS DISTINCT FROM 'enum'
       OR ef.enum_domain_code IS DISTINCT FROM 'master.legal_form');




UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', g.group_key)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- supplier_core_identity: brand/identity display fields
    ('name',                      'supplier_core_identity'),
    ('display_name',              'supplier_core_identity'),
    ('legal_name',                'supplier_core_identity'),
    ('supplier_type',             'supplier_core_identity'),
    ('status',                    'supplier_core_identity'),
    -- supplier_registration: legal jurisdiction + cross-references
    ('legal_form',                'supplier_registration'),
    ('registration_country_code', 'supplier_registration'),
    ('registration_no',           'supplier_registration'),
    ('tax_residence_country_code','supplier_registration'),
    ('external_ref',              'supplier_registration'),
    -- supplier_classification: sourcing / segmentation
    ('business_types',            'supplier_classification'),
    ('aliases',                   'supplier_classification'),
    -- supplier_company_profile: size and public-profile data
    ('founded_year',              'supplier_company_profile'),
    ('employee_count_band',       'supplier_company_profile'),
    ('annual_revenue_band',       'supplier_company_profile'),
    ('website_url',               'supplier_company_profile'),
    -- supplier_descriptions: narrative fields
    ('description',               'supplier_descriptions'),
    ('long_description',          'supplier_descriptions')
) AS g(field_name, group_key)
WHERE ef.entity_version_id = ev.id
  AND g.field_name = ef.name
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Pin id/tenant_id as system/hidden Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');



-- Normalize role profile field metadata.
-- Older installs may already have these rows with missing enum/reference targets,
-- which makes the Supplier Role dropdowns empty.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, enum_domain_code, reference_config,
    is_required, is_filterable, is_read_only, validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, 'standard', f.enum_domain_code, f.reference_config,
       f.is_required, f.is_filterable, f.is_read_only, f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('commodity_category_id', 'commodity_category_id', 'Commodity Category',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, '{"ref_entity":"commodity_category"}'::jsonb, 40),
    ('payment_term_id',   'payment_term_id',   'Payment Terms',   'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_term","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 50),
    ('payment_method_id', 'payment_method_id', 'Payment Method',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_method","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 60),
    ('supplier_code',     'supplier_code',     'Supplier Code',   'text', NULL::text,   'one',         NULL::text, NULL::jsonb,                                                                 false, true,  true,  '{"max_length":30}'::jsonb, 10),
    ('supplier_type',     'supplier_type',     'Supplier Type',   'enum', 'select',     'zero_or_one', 'master.supplier_type'::text, NULL::jsonb,                                                      false, true,  true,  NULL::jsonb, 20)
) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code,
       reference_config, is_required, is_filterable, is_read_only, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    ui_type = EXCLUDED.ui_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    reference_config = EXCLUDED.reference_config,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_read_only = EXCLUDED.is_read_only,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET label            = f.label,
    data_type        = f.data_type,
    ui_type          = f.ui_type,
    cardinality      = f.cardinality,
    origin           = 'standard',
    enum_domain_code = f.enum_domain_code,
    enum_config      = CASE WHEN f.enum_domain_code IS NOT NULL THEN NULL ELSE ef.enum_config END,
    reference_config = f.reference_config,
    is_required      = f.is_required,
    is_filterable    = f.is_filterable,
    is_read_only     = f.is_read_only,
    validation       = f.validation,
    sort_order       = f.sort_order
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('commodity_category_id', 'commodity_category_id', 'Commodity Category',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, '{"ref_entity":"commodity_category"}'::jsonb, 40),
    ('payment_term_id',   'payment_term_id',   'Payment Terms',   'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_term","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 50),
    ('payment_method_id', 'payment_method_id', 'Payment Method',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_method","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 60),
    ('supplier_code',     'supplier_code',     'Supplier Code',   'text', NULL::text,   'one',         NULL::text, NULL::jsonb,                                                                 false, true,  true,  '{"max_length":30}'::jsonb, 10),
    ('supplier_type',     'supplier_type',     'Supplier Type',   'enum', 'select',     'zero_or_one', 'master.supplier_type'::text, NULL::jsonb,                                                      false, true,  true,  NULL::jsonb, 20)
) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code,
       reference_config, is_required, is_filterable, is_read_only, validation, sort_order)
WHERE ef.entity_version_id = ev.id
  AND ef.name = f.name
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 7. Pin id and tenant_id as system/hidden (never rendered in UI) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- origin='system' Ã¢â€ â€™ FieldsRenderer excludes field from view grid
-- ui_type='hidden' Ã¢â€ â€™ edit-mode field renderer registry uses no-op renderer
-- Covers two cases: rows exist with wrong origin, or rows are missing (UPDATE
-- is a no-op; 000_common_fields.sql will insert them correctly on next run).
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');





-- Ã¢â€â‚¬Ã¢â€â‚¬ 0b. Remove stale field registrations from pre-BP-first schema Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- These columns no longer exist on the thin customer table.
UPDATE control.entity_field ef
   SET runtime_enabled = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev,
      control.entity e
WHERE ef.entity_version_id = ev.id
  AND e.id = ev.entity_id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('code', 'name', 'legal_name', 'payment_terms', 'currency_code',
                  'tax_number', 'credit_limit', 'contact_email', 'contact_phone',
                  'registration_no', 'tax_country_code', 'website_url');




-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â‚¬â€ thin AR role fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('customer_code',     'customer_code',     'Customer Code',     'text',           'one',         NULL::text,                       true,  true,  '{"max_length":30}'::jsonb,  10),
    ('customer_type',     'customer_type',     'Customer Type',     'enum',           'zero_or_one', 'master.customer_type'::text,     false, true,  NULL::jsonb,                 20),
    ('is_key_account',    'is_key_account',    'Key Account',       'boolean',        'one',         NULL::text,                       false, true,  NULL::jsonb,                 30),
    ('risk_rating',       'risk_rating',       'Risk Rating',       'enum',           'zero_or_one', 'master.credit_rating'::text,     false, true,  NULL::jsonb,                 40),
    ('status',            'status',            'Status',            'lifecycle_state','one',         NULL::text,                       true,  true,  NULL::jsonb,                 50)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Pin id/tenant_id as system/hidden Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');





-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('scheme',              'scheme',               'Scheme',               'enum',             'one',          'master.party_identifier_scheme'::text, true,  true,  NULL::jsonb,                10),
    ('value',               'value',                'Identifier Value',     'text',             'one',          NULL::text,                             true,  true,  '{"max_length":100}'::jsonb, 20),
    ('issuing_authority',   'issuing_authority',    'Issuing Authority',    'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                30),
    ('issued_at',           'issued_at',            'Issued Date',          'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                40),
    ('valid_until',         'valid_until',          'Valid Until',          'date',             'zero_or_one',  NULL::text,                             false, true,  NULL::jsonb,                50),
    ('is_verified',         'is_verified',          'Verified',             'boolean',          'one',          NULL::text,                             true,  true,  NULL::jsonb,                60),
    ('is_primary',          'is_primary',           'Primary',              'boolean',          'one',          NULL::text,                             true,  false, NULL::jsonb,                70),
    ('status',              'status',               'Status',               'lifecycle_state',  'one',          NULL::text,                             true,  true,  NULL::jsonb,                80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'party_identifier' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- _id columns mapped to _number field names (column_name retains actual DB column)
-- vat_registered Ã¢â€ â€™ is_vat_registered (boolean naming convention)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('country_code',              'country_code',             'Country',                  'text',            'one',          NULL::text,                                 true,  true,  NULL::jsonb,                              10),
    ('tax_classification',        'tax_classification',       'Tax Classification',       'enum',            'zero_or_one',  'master.supplier_tax_classification'::text, false, true,  NULL::jsonb,                              20),
    ('taxation_type',             'taxation_type',            'Taxation Type',            'enum',            'zero_or_one',  'master.supplier_taxation_type'::text,      false, true,  NULL::jsonb,                              30),
    ('tax_number',                'tax_id',                   'Tax ID',                   'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              40),
    ('state_tax_number',          'state_tax_id',             'State Tax ID',             'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              50),
    ('sales_tax_number',          'sales_tax_id',             'Sales Tax ID',             'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              60),
    ('service_tax_number',        'service_tax_id',           'Service Tax ID',           'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              70),
    ('regional_tax_number',       'regional_tax_id',          'Regional Tax ID',          'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              80),
    ('vat_number',                'vat_id',                   'VAT ID',                   'text',            'zero_or_one',  NULL::text,                                 false, true,  NULL::jsonb,                              90),
    ('is_vat_registered',         'vat_registered',           'VAT Registered',           'boolean',         'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             100),
    ('vat_registration_doc_id',    'vat_registration_doc_id',  'VAT Registration Document','uuid',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             105),
    ('has_tax_clearance',         'has_tax_clearance',        'Tax Clearance',            'boolean',         'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             110),
    ('tax_clearance_number',      'tax_clearance_number',     'Tax Clearance Number',     'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             120),
    ('tax_clearance_doc_id',       'tax_clearance_doc_id',     'Tax Clearance Document',   'uuid',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             125),
    ('tax_clearance_expiry_date', 'tax_clearance_expiry_date','Clearance Expiry Date',    'date',            'zero_or_one',  NULL::text,                                 false, true,  NULL::jsonb,                             130),
    ('global_location_number',    'global_location_number',   'Global Location Number',   'text',            'zero_or_one',  NULL::text,                                 false, false, '{"pattern":"^\\d{13}$"}'::jsonb,        140),
    ('penalty_information',        'penalty_information',      'Penalty Information',      'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             160),
    ('discount_information',       'discount_information',     'Discount Information',     'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             170),
    ('status',                    'status',                   'Status',                   'lifecycle_state', 'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             200)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'party_tax_profile' AND e.table_name = 'party_tax_profile'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- FK reference columns (ending _id) Ã¢â€ â€™ data_type 'uuid' per ef_id_suffix_chk
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('certification_type_id',  'certification_type_id',   'Certification Type',   'uuid',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  10),
    ('custom_name',            'custom_name',             'Custom Name',          'text',            'zero_or_one', NULL::text, false, false, '{"max_length":255}'::jsonb,  20),
    ('certificate_number',     'certificate_number',      'Certificate No.',      'text',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  30),
    ('certified_by',           'certified_by',            'Certified By',         'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  40),
    ('certified_location',     'certified_location',      'Certified Location',   'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  50),
    ('effective_from',         'effective_from',          'Effective Date',       'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  60),
    ('effective_until',        'effective_until',         'Expiry Date',          'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  70),
    ('additional_info',        'additional_info',         'Additional Info',      'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  80),
    ('document_attachment_id', 'document_attachment_id',  'Document',             'uuid',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  90),
    ('status',                 'status',                  'Status',               'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb,                 100)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'certification' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
-- Inline contact/address columns removed (Part B of 01i_tables_party_master.sql).
-- Channels Ã¢â€ â€™ master.contact_link; addresses Ã¢â€ â€™ master.address_link.
CROSS JOIN (VALUES
    ('contact_name',   'contact_name',   'Contact Name',    'text',            'one',         NULL::text,                 true,  true,  '{"max_length":255}'::jsonb, 10),
    ('business_title', 'business_title', 'Business Title / Position', 'text',   'zero_or_one', NULL::text,                 false, false, NULL::jsonb,                 20),
    ('contact_role',   'contact_role',   'Functional Role',           'enum',   'zero_or_one', 'master.contact_role',      false, true,  NULL::jsonb,                 25),
    ('is_primary',     'is_primary',     'Main Contact',              'boolean','one',         NULL::text,                 true,  true,  NULL::jsonb,                 30),
    ('contact_email',  'contact_email',  'Email Address',             'text',   'zero_or_one', NULL::text,                 false, false, '{"format":"email"}'::jsonb,  35),
    ('contact_phone',  'contact_phone',  'Phone Number',              'text',   'zero_or_one', NULL::text,                 false, false, NULL::jsonb,                 36),
    ('contact_fax',    'contact_fax',    'Fax Number',                'text',   'zero_or_one', NULL::text,                 false, false, NULL::jsonb,                 37),
    ('status',         'status',         'Status',          'lifecycle_state', 'one',         NULL::text,                 true,  true,  NULL::jsonb,                 40)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'party_contact_person' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET label = v.label
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
JOIN (VALUES
    ('business_title', 'Business Title / Position'),
    ('contact_role',   'Functional Role'),
    ('is_primary',     'Main Contact'),
    ('contact_email',  'Email Address'),
    ('contact_phone',  'Phone Number'),
    ('contact_fax',    'Fax Number')
) AS v(name, label) ON true
WHERE ef.entity_version_id = ev.id
  AND v.name = ef.name
  AND e.entity_code = 'party_contact_person'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;



UPDATE control.entity_field ef
SET ui_type = v.ui_type,
    origin  = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
JOIN (VALUES
    ('contact_email', 'email'),
    ('contact_phone', 'phone'),
    ('contact_fax',   'phone')
) AS v(name, ui_type) ON true
WHERE ef.entity_version_id = ev.id
  AND v.name = ef.name
  AND e.entity_code = 'party_contact_person'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 4. Deactivate stale inline contact/address fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET runtime_enabled = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'party_contact_person'
  AND e.entity_code = 'party_contact_person' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
    'email','phone_calling_code','phone_area','phone_number','phone_extension',
    'fax_calling_code','fax_area','fax_number','fax_extension',
    'address_line1','address_line2','city','state_region','postal_code','address_country_code'
  );



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('relation_type',   'relation_type',    'Role',                 'enum',             'one',          'master.party_governance_role'::text,   true,  true,  NULL::jsonb,                  10),
    ('member_name',     'member_name',      'Name',                 'text',             'one',          NULL::text,                             true,  true,  '{"max_length":255}'::jsonb,  20),
    ('member_type',     'member_type',      'Member Type',          'enum',             'one',          'master.party_governance_member_type'::text,true,true,NULL::jsonb,                  30),
    ('company_name',    'company_name',     'Company Name',         'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  40),
    ('member_business_partner_id','member_business_partner_id','Linked BP',      'reference',        'zero_or_one',  NULL::text,                             false, true,  '{"ref_entity":"business_partner"}'::jsonb, 45),
    ('member_country_code','member_country_code','Country',         'text',             'zero_or_one',  NULL::text,                             false, true,  '{"max_length":2}'::jsonb,     48),
    ('business_title',  'business_title',   'Title',                'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  50),
    ('ownership_pct',   'ownership_pct',    'Ownership %',          'decimal',          'zero_or_one',  NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 60),
    ('voting_pct',      'voting_pct',       'Voting %',             'decimal',          'zero_or_one',  NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 62),
    ('beneficial_ownership_pct','beneficial_ownership_pct','Beneficial Ownership %','decimal','zero_or_one',NULL::text,                          false, true,  '{"min":0,"max":100}'::jsonb, 64),
    ('directness',      'directness',       'Directness',           'enum',             'zero_or_one',  'master.party_governance_directness'::text,false,true,NULL::jsonb,                  66),
    ('control_nature',  'control_nature',   'Control Nature',       'enum',             'zero_or_one',  'master.party_governance_control_nature'::text,false,true,NULL::jsonb,              68),
    ('share_class',     'share_class',      'Share Class',          'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  70),
    ('authority_scope', 'authority_scope',  'Authority Scope',      'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  74),
    ('authority_limit_amount','authority_limit_amount','Authority Limit','decimal',     'zero_or_one',  NULL::text,                             false, false, '{"min":0}'::jsonb,           76),
    ('authority_limit_currency_code','authority_limit_currency_code','Authority Currency','text',       'zero_or_one',  NULL::text,                             false, false, '{"max_length":3}'::jsonb,     78),
    ('appointed_date',  'appointed_date',   'Appointed Date',       'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  80),
    ('end_of_term',     'end_of_term',      'End of Term',          'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  90),
    ('kyc_status',      'kyc_status',       'KYC Status',           'enum',             'one',          'master.party_governance_kyc_status'::text,true,true,NULL::jsonb,                 100),
    ('sanctions_status','sanctions_status', 'Sanctions Status',     'enum',             'one',          'master.party_governance_sanctions_status'::text,true,true,NULL::jsonb,           102),
    ('pep_status',      'pep_status',       'PEP Status',           'enum',             'one',          'master.party_governance_pep_status'::text,true,true,NULL::jsonb,                 104),
    ('last_screened_at','last_screened_at', 'Last Screened',        'timestamptz',      'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 106),
    ('evidence_status', 'evidence_status',  'Evidence Status',      'enum',             'one',          'master.party_governance_evidence_status'::text,true,true,NULL::jsonb,            108),
    ('source_of_wealth','source_of_wealth', 'Source of Wealth',     'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 110),
    ('last_reviewed_at','last_reviewed_at', 'Last Reviewed',        'timestamptz',      'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 112),
    ('next_review_at',  'next_review_at',   'Next Review',          'date',             'zero_or_one',  NULL::text,                             false, true,  NULL::jsonb,                 114),
    ('reviewed_by',     'reviewed_by',      'Reviewed By',          'uuid',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 116),
    ('notes',           'notes',            'Notes',                'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 120),
    ('status',          'status',           'Status',               'lifecycle_state',  'one',          NULL::text,                             true,  true,  NULL::jsonb,                 130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'party_governance_relation' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET data_type = sub.data_type,
    enum_domain_code = sub.enum_domain_code,
    ui_type = COALESCE(sub.ui_type, ef.ui_type),
    reference_config = CASE
        WHEN sub.name = 'member_business_partner_id'
        THEN '{"target_entity":"business_partner","display_field":"name"}'::jsonb
        ELSE ef.reference_config
    END
FROM (
    SELECT ef.id,
           f.name,
           f.data_type,
           f.enum_domain_code,
           f.ui_type
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ef.entity_version_id = ev.id
    JOIN control.entity e ON e.id = ev.entity_id
    JOIN (VALUES
        ('member_type', 'enum', 'master.party_governance_member_type'::text, NULL::text),
        ('member_business_partner_id', 'reference', NULL::text, 'reference'::text),
        ('member_country_code', 'text', NULL::text, 'country'::text),
        ('directness', 'enum', 'master.party_governance_directness'::text, NULL::text),
        ('control_nature', 'enum', 'master.party_governance_control_nature'::text, NULL::text),
        ('kyc_status', 'enum', 'master.party_governance_kyc_status'::text, NULL::text),
        ('sanctions_status', 'enum', 'master.party_governance_sanctions_status'::text, NULL::text),
        ('pep_status', 'enum', 'master.party_governance_pep_status'::text, NULL::text),
        ('evidence_status', 'enum', 'master.party_governance_evidence_status'::text, NULL::text)
    ) AS f(name, data_type, enum_domain_code, ui_type) ON ef.name = f.name
    WHERE e.entity_code = 'party_governance_relation'
      AND e.tenant_id IS NULL AND ev.version_no = 1
) AS sub
WHERE ef.id = sub.id;



-- 100_master/002_supplier_ext_fields.sql
-- Purpose: Add extended business profile fields to the supplier entity registration.
-- Covers the columns added via ALTER TABLE master.supplier in 01b_tables_finance.sql.
-- Idempotent: ON CONFLICT DO UPDATE
-- Cardinality: 'many' for text[] array columns (zero_or_many not a valid value)

INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('long_description',    'long_description',     'Long Description',     'text',         'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                            105),
    ('aliases',             'aliases',              'Aliases',              'text_array',   'many',        NULL::text,                             false, false, NULL::jsonb,                            110),
    ('business_types',      'business_types',       'Business Types',       'text_array',   'many',        'master.business_type'::text,           false, true,  NULL::jsonb,                            120),
    ('legal_form',          'legal_form',           'Legal Form',           'enum',         'zero_or_one', 'master.legal_form'::text,              false, true,  NULL::jsonb,                            130),
    ('founded_year',        'founded_year',         'Founded Year',         'integer',      'zero_or_one', NULL::text,                             false, true,  '{"min":1800,"max":2200}'::jsonb,        140),
    ('employee_count_band', 'employee_count_band',  'Employee Count',       'enum',         'zero_or_one', 'master.employee_count_band'::text,     false, true,  NULL::jsonb,                            150),
    ('annual_revenue_band', 'annual_revenue_band',  'Annual Revenue Band',  'enum',         'zero_or_one', 'master.annual_revenue_band'::text,     false, true,  NULL::jsonb,                            160)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.entity_code = 'supplier' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', g.group_key)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('aliases',             'supplier_classification'),
    ('business_types',      'supplier_classification'),
    ('founded_year',        'supplier_company_profile'),
    ('employee_count_band', 'supplier_company_profile'),
    ('annual_revenue_band', 'supplier_company_profile'),
    ('long_description',    'supplier_descriptions')
) AS g(field_name, group_key)
WHERE ef.entity_version_id = ev.id
  AND g.field_name = ef.name
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.entity_code = 'supplier' AND e.tenant_id IS NULL AND ev.version_no = 1;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Migration: neutralize domain refs on existing rows Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET    enum_domain_code = 'master.legal_form'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  ef.column_name = 'legal_form'
  AND  ef.enum_domain_code = 'master.supplier_legal_form'
  AND  e.table_schema = 'master' AND e.table_name = 'supplier'
  AND  e.entity_code = 'supplier' AND e.tenant_id IS NULL;



UPDATE control.entity_field ef
SET    enum_domain_code = 'master.business_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  ef.column_name = 'business_types'
  AND  ef.enum_domain_code = 'master.supplier_business_type'
  AND  e.table_schema = 'master' AND e.table_name = 'supplier'
  AND  e.entity_code = 'supplier' AND e.tenant_id IS NULL;






-- 100_master/007_business_partner_address.sql
-- Purpose: Register master.v_business_partner_address as business_partner_address child entity.
-- Backed by a view (address_link + address JOIN, scoped to owner_type='business_partner').
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('purpose',           'purpose',           'Role',             'enum',         'one',          'master.address_purpose'::text,         true,  true,  NULL::jsonb, 10),
    ('role_qualifier',    'role_qualifier',    'Role Qualifier',   'enum',         'zero_or_one',  'master.address_role_qualifier'::text,  false, true,  NULL::jsonb, 15),
    ('is_primary',        'is_primary',        'Primary',          'boolean',      'one',          NULL::text,                             true,  true,  NULL::jsonb, 20),
    ('city',              'city',              'City',             'text',         'zero_or_one',  NULL::text,                    false, true,  NULL::jsonb, 30),
    ('country_code',      'country_code',      'Country',          'text',         'zero_or_one',  NULL::text,                    false, true,  NULL::jsonb, 40),
    ('formatted_address', 'formatted_address', 'Formatted Address','text',         'zero_or_one',  NULL::text,                    false, false, NULL::jsonb, 50),
    ('address_type',      'address_type',      'Address Type',     'enum',         'zero_or_one',  'master.address_type'::text,   false, true,  NULL::jsonb, 60),
    ('effective_from',    'effective_from',    'Effective From',   'date',         'one',          NULL::text,                    true,  true,  NULL::jsonb, 70),
    ('effective_until',   'effective_until',   'Effective Until',  'date',         'zero_or_one',  NULL::text,                    false, false, NULL::jsonb, 80),
    ('line1',             'line1',             'Address Line 1',   'text',         'zero_or_one',  NULL::text,                    false, false, NULL::jsonb, 90),
    ('postal_code',       'postal_code',       'Postal Code',      'text',         'zero_or_one',  NULL::text,                    false, true,  NULL::jsonb, 100),
    ('owner_id',          'owner_id',          'Owner',            'uuid',         'one',          NULL::text,                    true,  false, NULL::jsonb, 110),
    ('address_id',        'address_id',        'Address Record',   'uuid',         'one',          NULL::text,                    true,  false, NULL::jsonb, 120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'v_business_partner_address' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- 100_master/008_supplier_block.sql
-- Purpose: Register master.supplier_block as supplier_block entity.
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('block_type',   'block_type',   'Block Type',    'text',            'one',         NULL::text, true,  true,  NULL::jsonb,  10),
    ('block_reason', 'block_reason', 'Block Reason',  'text',            'one',         NULL::text, true,  false, NULL::jsonb,  20),
    ('blocked_at',   'blocked_at',   'Blocked At',    'datetime',        'one',         NULL::text, true,  true,  NULL::jsonb,  30),
    ('is_active',    'is_active',    'Active',        'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,  40),
    ('lifted_at',    'lifted_at',    'Lifted At',     'datetime',        'zero_or_one', NULL::text, false, true,  NULL::jsonb,  50),
    ('lift_reason',  'lift_reason',  'Lift Reason',   'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,  60),
    ('notes',        'notes',        'Notes',         'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,  70),
    ('status',       'status',       'Status',        'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb,  80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_block' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET origin = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'supplier_block'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'is_active'
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');



-- 100_master/009_customer_ext_fields.sql
-- Purpose: Align customer entity registration with the three-party master model.
-- Ã‚Â§1: Deactivate stale AR-behavior fields (belong in company_code_customer_profile)
-- Ã‚Â§2: Fix tax_number column_name mapping (DB column is tax_id)
-- Ã‚Â§3: Add missing core identity/legal fields
-- Ã‚Â§4: Add extended business profile fields (mirror of 002_supplier_ext_fields.sql)
-- Idempotent: update guards plus conflict-updating upserts

-- Ã¢â€â‚¬Ã¢â€â‚¬ Ã‚Â§1. Deactivate stale fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET runtime_enabled = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('payment_terms', 'currency_code', 'credit_limit',
                  'contact_email', 'contact_phone');


-- Ã¢â€â‚¬Ã¢â€â‚¬ Ã‚Â§2. Fix tax_number column_name (DB column is tax_id, not tax_number) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET column_name = 'tax_id'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'tax_number' AND ef.column_name = 'tax_number';


-- Ã¢â€â‚¬Ã¢â€â‚¬ Ã‚Â§3. Add missing core identity / legal fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('display_name',              'display_name',              'Display Name',         'text',            'zero_or_one', NULL::text,                    false, false, '{"max_length":255}'::jsonb,  25),
    ('description',               'description',               'Description',          'text',            'zero_or_one', NULL::text,                    false, false, '{"max_length":500}'::jsonb,  75),
    ('registration_no',           'registration_no',           'Registration No.',     'text',            'zero_or_one', NULL::text,                    false, true,  NULL::jsonb,                  85),
    ('registration_country_code', 'registration_country_code', 'Reg. Country',         'text',            'zero_or_one', NULL::text,                    false, true,  NULL::jsonb,                  90),
    ('tax_number',                'tax_id',                    'Primary Tax ID',       'text',            'zero_or_one', NULL::text,                    false, false, '{"max_length":50}'::jsonb,   80),
    ('website_url',               'website_url',               'Website',              'text',            'zero_or_one', NULL::text,                    false, false, NULL::jsonb,                  95),
    ('external_ref',              'external_ref',              'External Ref',         'text',            'zero_or_one', NULL::text,                    false, false, NULL::jsonb,                  96),
    ('parent_customer_number',    'parent_customer_id',        'Parent Customer',      'uuid',            'zero_or_one', NULL::text,                    false, false, NULL::jsonb,                  97)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- Ã¢â€â‚¬Ã¢â€â‚¬ Ã‚Â§4. Extended business profile fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('long_description',    'long_description',    'Long Description',    'text',    'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                    105),
    ('aliases',             'aliases',             'Aliases',             'text_array', 'many',        NULL::text,                             false, false, NULL::jsonb,                    110),
    ('business_types',      'business_types',      'Business Types',      'text_array', 'many',        'master.business_type'::text,           false, true,  NULL::jsonb,                    120),
    ('legal_form',          'legal_form',          'Legal Form',          'enum',    'zero_or_one', 'master.legal_form'::text,              false, true,  NULL::jsonb,                    130),
    ('founded_year',        'founded_year',        'Founded Year',        'integer', 'zero_or_one', NULL::text,                             false, true,  '{"min":1800,"max":2200}'::jsonb, 140),
    ('employee_count_band', 'employee_count_band', 'Employee Count',      'enum',    'zero_or_one', 'master.employee_count_band'::text,     false, true,  NULL::jsonb,                    150),
    ('annual_revenue_band', 'annual_revenue_band', 'Annual Revenue Band', 'enum',    'zero_or_one', 'master.annual_revenue_band'::text,     false, true,  NULL::jsonb,                    160)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- Ã¢â€â‚¬Ã¢â€â‚¬ Migration: neutralize domain refs on existing rows Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET    enum_domain_code = 'master.legal_form'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  ef.column_name = 'legal_form'
  AND  ef.enum_domain_code = 'master.supplier_legal_form'
  AND  e.table_schema = 'master' AND e.table_name = 'customer'
  AND  e.entity_code = 'customer' AND e.tenant_id IS NULL;


UPDATE control.entity_field ef
SET    enum_domain_code = 'master.business_type'
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  ef.column_name = 'business_types'
  AND  ef.enum_domain_code = 'master.supplier_business_type'
  AND  e.table_schema = 'master' AND e.table_name = 'customer'
  AND  e.entity_code = 'customer' AND e.tenant_id IS NULL;




-- Reference display metadata for AP profile fields used by supplier/company-code cards.
UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_id',                       'supplier',                      jsonb_build_object('target_entity','supplier','target_field','id','display_field','business_title','picker',jsonb_build_object('code_field','supplier_code','show_code',true))),
    ('company_code_id',                   'company_code',                  jsonb_build_object('target_entity','company_code','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('payment_term_id',                   'payment_term',                  jsonb_build_object('target_entity','payment_term','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('payment_method_id',                 'payment_method',                jsonb_build_object('target_entity','payment_method','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('preferred_remittance_bank_link_id', 'v_business_partner_bank_account', jsonb_build_object('target_entity','v_business_partner_bank_account','target_field','id','display_field','bank_name','picker',jsonb_build_object('code_field','account_id_value_masked','show_code',true))),
    ('default_accounting_profile_id',     'accounting_profile',            jsonb_build_object('target_entity','accounting_profile','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('tax_group_id',                      'tax_group',                     jsonb_build_object('target_entity','tax_group','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))),
    ('default_wht_tax_group_id',          'tax_group',                     jsonb_build_object('target_entity','tax_group','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'company_code_supplier_profile'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );




-- 100_master/015_customer_qualification.sql
-- Purpose: Register master.customer_qualification as customer_qualification entity.
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('credit_status',               'credit_status',               'Credit Status',         'text',            'one',         NULL::text, true,  true,  NULL::jsonb,            10),
    ('credit_score',                'credit_score',                'Credit Score',          'integer',         'zero_or_one', NULL::text, false, true,  '{"min":0,"max":1000}'::jsonb, 20),
    ('credit_rating',               'credit_rating',               'Credit Rating',         'text',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,            30),
    ('dso_days',                    'dso_days',                    'DSO (Days)',             'integer',         'zero_or_one', NULL::text, false, true,  '{"min":0}'::jsonb,     40),
    ('payment_behavior',            'payment_behavior',            'Payment Behavior',      'text',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,            50),
    ('has_overdue_history',         'has_overdue_history',         'Overdue History',       'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,            60),
    ('kyc_status',                  'kyc_status',                  'KYC Status',            'text',            'one',         NULL::text, true,  true,  NULL::jsonb,            70),
    ('aml_sanctions_status',        'aml_sanctions_status',        'AML / Sanctions',       'text',            'one',         NULL::text, true,  true,  NULL::jsonb,            80),
    ('is_dunning_eligible',         'is_dunning_eligible',         'Dunning Eligible',      'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,            90),
    ('is_statement_eligible',       'is_statement_eligible',       'Statement Eligible',    'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,           100),
    ('last_credit_review_date',     'last_credit_review_date',     'Last Review',           'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,           110),
    ('next_credit_review_date',     'next_credit_review_date',     'Next Review',           'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,           120),
    ('status',                      'status',                      'Status',                'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb,           130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'customer_qualification' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- 100_master/016_supplier_qualification.sql
-- Purpose: Register master.supplier_qualification as supplier_qualification entity.
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('onboarding_status',        'onboarding_status',        'Onboarding Status',  'text',            'one',         NULL::text, true,  true,  NULL::jsonb,                     10),
    ('profile_completeness_pct', 'profile_completeness_pct', 'Profile Complete %', 'integer',         'zero_or_one', NULL::text, false, false, '{"min":0,"max":100}'::jsonb,    20),
    ('is_approved_supplier',     'is_approved_supplier',     'Approved Supplier',  'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,                     30),
    ('is_preferred_supplier',    'is_preferred_supplier',    'Preferred Supplier', 'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,                     40),
    ('is_blocked',               'is_blocked',               'Blocked',            'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,                     50),
    ('block_reason',             'block_reason',             'Block Reason',       'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                     60),
    ('risk_tier',                'risk_tier',                'Risk Tier',          'text',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                     70),
    ('sanctions_status',         'sanctions_status',         'Sanctions Status',   'text',            'one',         NULL::text, true,  true,  NULL::jsonb,                     80),
    ('aml_kyc_status',           'aml_kyc_status',           'AML / KYC Status',   'text',            'one',         NULL::text, true,  true,  NULL::jsonb,                     90),
    ('delivery_score',           'delivery_score',           'Delivery Score',     'decimal',         'zero_or_one', NULL::text, false, true,  '{"min":0,"max":100}'::jsonb,   100),
    ('quality_score',            'quality_score',            'Quality Score',      'decimal',         'zero_or_one', NULL::text, false, true,  '{"min":0,"max":100}'::jsonb,   110),
    ('sla_score',                'sla_score',                'SLA Score',          'decimal',         'zero_or_one', NULL::text, false, true,  '{"min":0,"max":100}'::jsonb,   120),
    ('last_review_date',         'last_review_date',         'Last Review',        'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                    130),
    ('next_review_date',         'next_review_date',         'Next Review',        'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                    140),
    ('status',                   'status',                   'Status',             'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb,                    150)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_qualification' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- 100_master/017_legal_entity.sql
-- Purpose: control.entity + entity_version + entity_field for Legal Entity (master.legal_entity)
-- Module: ACC (Finance Core)
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â‚¬â€ core statutory / finance fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('code',                       'code',                       'Entity Code',              'text',            'one',         NULL::text,                             true,  true,  '{"max_length":20}'::jsonb,   10),
    ('name',                       'name',                       'Entity Name',              'text',            'one',         NULL::text,                             true,  true,  '{"max_length":255}'::jsonb,  20),
    ('display_name',               'display_name',               'Display Name',             'text',            'zero_or_one', NULL::text,                             false, false, '{"max_length":255}'::jsonb,  25),
    ('legal_name',                 'legal_name',                 'Legal Name',               'text',            'zero_or_one', NULL::text,                             false, false, '{"max_length":255}'::jsonb,  30),
    ('entity_type',                'entity_type',                'Entity Type',              'enum',            'one',         'master.legal_entity_type'::text,        true,  true,  NULL::jsonb,                  40),
    ('legal_form',                 'legal_form',                 'Legal Form',               'enum',            'zero_or_one', 'master.legal_form'::text,               false, true,  NULL::jsonb,                  50),
    ('registration_no',            'registration_no',            'Registration No.',         'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                  55),
    ('registration_country_code',  'registration_country_code',  'Country of Incorporation', 'text',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  57),
    ('country_code',               'country_code',               'Operating Country',        'text',            'one',         NULL::text,                             true,  true,  NULL::jsonb,                  60),
    ('tax_residence_country_code', 'tax_residence_country_code', 'Tax Residence Country',    'text',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  65),
    ('functional_currency',        'functional_currency',        'Functional Currency',      'text',            'one',         NULL::text,                             true,  true,  '{"max_length":3}'::jsonb,    70),
    ('reporting_currency',         'reporting_currency',         'Reporting Currency',       'text',            'one',         NULL::text,                             true,  true,  '{"max_length":3}'::jsonb,    75),
    ('regulatory_framework',       'regulatory_framework',       'Regulatory Framework',     'enum',            'zero_or_one', 'master.legal_entity_framework'::text,   false, true,  NULL::jsonb,                  80),
    ('tax_registration_number',    'tax_registration_number',    'Tax Registration No.',     'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                  85),
    ('incorporation_date',         'incorporation_date',         'Incorporation Date',       'date',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  90),
    ('effective_from',             'effective_from',             'Effective From',           'date',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  92),
    ('effective_until',            'effective_until',            'Effective Until',          'date',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  94),
    ('consolidation_method',       'consolidation_method',       'Consolidation Method',     'enum',            'one',         'master.legal_entity_consolidation'::text, true, true, NULL::jsonb,                 96),
    ('ownership_pct',              'ownership_pct',              'Ownership %',              'decimal',         'zero_or_one', NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 98),
    ('website_url',                'website_url',                'Website',                  'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                 100),
    ('external_ref',               'external_ref',               'External Ref',             'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                 105),
    ('description',                'description',                'Description',              'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                 110),
    ('status',                     'status',                     'Status',                   'lifecycle_state', 'one',         NULL::text,                             true,  true,  NULL::jsonb,                 120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'legal_entity'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 4. Extended profile fields (added via 01i_tables_party_master.sql) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('aliases',             'aliases',             'Aliases',             'text_array', 'many',        NULL::text,                        false, false, NULL::jsonb,                     125),
    ('business_types',      'business_types',      'Business Types',      'text_array', 'many',        'master.business_type'::text,       false, true,  NULL::jsonb,                     126),
    ('founded_year',        'founded_year',        'Founded Year',        'integer', 'zero_or_one', NULL::text,                        false, true,  '{"min":1800,"max":2200}'::jsonb, 127),
    ('employee_count_band', 'employee_count_band', 'Employee Count',      'enum',    'zero_or_one', 'master.employee_count_band'::text, false, true,  NULL::jsonb,                     128),
    ('annual_revenue_band', 'annual_revenue_band', 'Annual Revenue Band', 'enum',    'zero_or_one', 'master.annual_revenue_band'::text, false, true,  NULL::jsonb,                     129)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'legal_entity'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 5. Migration: update existing rows to reflect corrections Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Runs safely on re-seed; no-op if already correct.
DO $$
DECLARE v_entity_id uuid;
BEGIN
    SELECT e.id INTO v_entity_id
    FROM control.entity e
    WHERE e.table_schema = 'master' AND e.table_name = 'legal_entity'
      AND e.tenant_id IS NULL;

    IF v_entity_id IS NULL THEN RETURN; END IF;

    -- 5a. Neutralize legal_form domain
    UPDATE control.entity_field ef
    SET    enum_domain_code = 'master.legal_form'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'legal_form'
      AND  ef.enum_domain_code = 'master.supplier_legal_form';

    -- 5b. Neutralize business_types domain
    UPDATE control.entity_field ef
    SET    enum_domain_code = 'master.business_type'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'business_types'
      AND  ef.enum_domain_code = 'master.supplier_business_type';

    -- 5c. Fix country_code label and add registration fields
    UPDATE control.entity_field ef
    SET    label = 'Operating Country'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'country_code'
      AND  ef.label = 'Country of Incorp.';

    -- 5d. Wire regulatory_framework to its enum domain
    UPDATE control.entity_field ef
    SET    data_type = 'enum',
           enum_domain_code = 'master.legal_entity_framework'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'regulatory_framework'
      AND  ef.enum_domain_code IS NULL;

    -- 5e. Wire consolidation_method to its enum domain
    UPDATE control.entity_field ef
    SET    data_type = 'enum',
           enum_domain_code = 'master.legal_entity_consolidation'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'consolidation_method'
      AND  ef.enum_domain_code IS NULL;
END $$;



-- 100_master/018_customer_app_index.sql
-- Purpose: control.entity + entity_version + entity_field for customer_app_index
-- Module: CRM (Customer Relationship Management)
-- Role: INDEX entity Ã¢â‚¬â€ denormalized list/search surface for master.customer_app_index
-- entity_class = 'AGGREGATE' Ã¢â‚¬â€ read-only from app; written exclusively by DB triggers
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable, is_searchable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- FK references
    ('customer_id',               'customer_id',               'Customer',               'uuid',          'one',        NULL::text,                    true,  false, false, NULL::jsonb,                 5),
    ('business_partner_id',       'business_partner_id',       'Business Partner',        'uuid',          'one',        NULL::text,                    true,  false, false, NULL::jsonb,                 6),
    -- Role fields
    ('customer_code',             'customer_code',             'Customer Code',           'text',          'one',        NULL::text,                    true,  true,  false, '{"max_length":30}'::jsonb,  10),
    ('customer_type',             'customer_type',             'Customer Type',           'enum',          'zero_or_one','master.customer_type'::text,  false, true,  false, NULL::jsonb,                 20),
    ('customer_status',           'customer_status',           'Status',                  'lifecycle_state','one',       NULL::text,                    true,  true,  false, NULL::jsonb,                 30),
    ('is_key_account',            'is_key_account',            'Key Account',             'boolean',       'one',        NULL::text,                    false, true,  false, NULL::jsonb,                 35),
    ('risk_rating',               'risk_rating',               'Credit Status',           'enum',          'zero_or_one','master.credit_rating'::text,  false, true,  false, NULL::jsonb,                 40),
    -- Identity fields (from BP)
    ('business_partner_code',     'business_partner_code',     'BP Code',                 'text',          'zero_or_one',NULL::text,                    false, true,  false, NULL::jsonb,                 50),
    ('name',                      'name',                      'Name',                    'text',          'zero_or_one',NULL::text,                    false, true,  false, '{"max_length":255}'::jsonb, 60),
    ('display_name',              'display_name',              'Display Name',            'text',          'zero_or_one',NULL::text,                    false, false, false, '{"max_length":255}'::jsonb, 65),
    ('legal_name',                'legal_name',                'Legal Name',              'text',          'zero_or_one',NULL::text,                    false, false, false, '{"max_length":255}'::jsonb, 70),
    ('legal_form',                'legal_form',                'Legal Form',              'enum',          'zero_or_one','master.legal_form'::text,      false, true,  false, NULL::jsonb,                 72),
    ('business_types',            'business_types',            'Business Types',          'text_array',    'many',       NULL::text,                    false, true,  false, NULL::jsonb,                 74),
    ('registration_no',           'registration_no',           'Registration No.',        'text',          'zero_or_one',NULL::text,                    false, true,  false, NULL::jsonb,                 80),
    ('registration_country_code', 'registration_country_code', 'Country',                 'text',          'zero_or_one',NULL::text,                    false, true,  false, NULL::jsonb,                 90),
    -- Search surface
    ('search_text',               'search_text',               'Search',                  'text',          'one',        NULL::text,                    false, false, true,  NULL::jsonb,                 200)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer_app_index'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- 100_master/017_supplier_app_index.sql
-- Purpose: control.entity + entity_version + entity_field for supplier_app_index
-- Module: BUY (Buying)
-- Role: INDEX entity Ã¢â‚¬â€ denormalized list/search surface for master.supplier_app_index
-- entity_class = 'AGGREGATE' Ã¢â‚¬â€ read-only from app; written exclusively by DB triggers
-- Idempotent: conflict-updating upserts


-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- All columns are standard/system Ã¢â‚¬â€ no user-configurable fields on an index entity.
-- search_text is the single searchable field; others are filterable for facets.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable, is_searchable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- FK references
    ('supplier_id',                'supplier_id',                'Supplier',               'uuid',          'one',        NULL::text,                   true,  false, false, NULL::jsonb,                 5),
    ('business_partner_id',        'business_partner_id',        'Business Partner',        'uuid',          'one',        NULL::text,                   true,  false, false, NULL::jsonb,                 6),
    -- Role fields
    ('supplier_code',              'supplier_code',              'Supplier Code',           'text',          'one',        NULL::text,                   true,  true,  false, '{"max_length":30}'::jsonb,  10),
    ('supplier_type',              'supplier_type',              'Supplier Type',           'enum',          'zero_or_one','master.supplier_type'::text, false, true,  false, NULL::jsonb,                 20),
    ('supplier_status',            'supplier_status',            'Status',                  'lifecycle_state','one',       NULL::text,                   true,  true,  false, NULL::jsonb,                 30),
    ('is_payment_ready',           'is_payment_ready',           'Payment Ready',           'boolean',       'one',        NULL::text,                   false, true,  false, NULL::jsonb,                 35),
    -- Identity fields (from BP)
    ('business_partner_code',      'business_partner_code',      'BP Code',                 'text',          'zero_or_one',NULL::text,                   false, true,  false, NULL::jsonb,                 40),
    ('name',                       'name',                       'Name',                    'text',          'zero_or_one',NULL::text,                   false, true,  false, '{"max_length":255}'::jsonb, 50),
    ('display_name',               'display_name',               'Display Name',            'text',          'zero_or_one',NULL::text,                   false, false, false, '{"max_length":255}'::jsonb, 55),
    ('legal_name',                 'legal_name',                 'Legal Name',              'text',          'zero_or_one',NULL::text,                   false, false, false, '{"max_length":255}'::jsonb, 60),
    ('legal_form',                 'legal_form',                 'Legal Form',              'text',          'zero_or_one',NULL::text,                   false, false, false, NULL::jsonb,                 65),
    ('registration_no',            'registration_no',            'Registration No.',        'text',          'zero_or_one',NULL::text,                   false, true,  false, NULL::jsonb,                 70),
    ('registration_country_code',  'registration_country_code',  'Country',                 'text',          'zero_or_one',NULL::text,                   false, true,  false, NULL::jsonb,                 75),
    ('tax_residence_country_code', 'tax_residence_country_code', 'Tax Country',             'text',          'zero_or_one',NULL::text,                   false, false, false, NULL::jsonb,                 80),
    ('partner_category',           'partner_category',           'Partner Category',        'enum',          'zero_or_one','master.business_partner_category'::text, false, true, false, NULL::jsonb, 85),
    ('business_types',             'business_types',             'Business Types',          'text_array',    'many',       NULL::text,                   false, true,  false, NULL::jsonb,                 87),
    -- Search surface Ã¢â‚¬â€ single searchable field covering all key text content
    ('search_text',                'search_text',                'Search',                  'text',          'one',        NULL::text,                   false, false, true,  NULL::jsonb,                 200)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier_app_index'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- 100_master/020_company_code_supplier_intent_policy.sql
-- Purpose: Register master.company_code_supplier_intent_policy as an entity
--          with version, fields, and display_config.
-- Idempotent: conflict-updating upserts

-- Ã¢â€â‚¬Ã¢â€â‚¬ 1+2. entity/entity_version extracted to 006_domain_entities.sql Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'supplier_profile_id', 'Supplier Profile',    'uuid',          'one',        NULL::text, true,  true,  NULL::jsonb, 10),
    ('business_intent_id',  'business_intent_id',  'Business Intent',     'uuid',          'one',        NULL,       true,  true,  NULL,        20),
    ('mapping_mode',        'mapping_mode',        'Mapping Mode',        'text',          'one',        NULL,       true,  true,  NULL,        30),
    ('is_default',          'is_default',          'Default Intent',      'boolean',       'one',        NULL,       true,  true,  NULL,        40),
    ('is_sourcing_allowed', 'is_sourcing_allowed', 'Sourcing Allowed',    'boolean',       'one',        NULL,       true,  true,  NULL,        50),
    ('is_po_allowed',       'is_po_allowed',       'PO Allowed',          'boolean',       'one',        NULL,       true,  true,  NULL,        60),
    ('is_invoice_allowed',  'is_invoice_allowed',  'Invoice Allowed',     'boolean',       'one',        NULL,       true,  true,  NULL,        70),
    ('status',              'status',              'Status',              'lifecycle_state','one',       NULL,       true,  true,  NULL,        80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'company_code_supplier_intent_policy' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'company_code_supplier_profile', jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id')),
    ('business_intent_id',  'business_intent',               jsonb_build_object('target_entity','business_intent','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'company_code_supplier_intent_policy'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );



-- 100_master/021_supplier_posting_override.sql
-- Purpose: Register control.supplier_posting_override as an entity
--          with version, fields, and display_config.
-- Idempotent: conflict-updating upserts

-- Ã¢â€â‚¬Ã¢â€â‚¬ 1+2. entity/entity_version extracted to 006_domain_entities.sql Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'supplier_profile_id', 'Supplier Profile',  'uuid',          'one',        NULL::text, true,  true,  NULL::jsonb, 10),
    ('posting_role_code',   'posting_role_code',   'Posting Role',      'text',          'one',        NULL,       true,  true,  NULL,        20),
    ('gl_account_id',       'gl_account_id',       'GL Account',        'uuid',          'one',        NULL,       true,  true,  NULL,        30),
    ('book_code',           'book_code',           'Book',              'text',          'one',        NULL,       true,  true,  NULL,        40),
    ('effective_from',      'effective_from',      'Effective From',    'date',          'one',        NULL,       true,  true,  NULL,        50),
    ('effective_to',        'effective_to',        'Effective To',      'date',          'zero_or_one',NULL,       false, true,  NULL,        60),
    ('reason',              'reason',              'Reason',            'text',          'zero_or_one',NULL,       false, false, NULL,        70),
    ('status',              'status',              'Status',            'lifecycle_state','one',       NULL,       true,  true,  NULL,        80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_posting_override' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'company_code_supplier_profile', jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id')),
    ('gl_account_id',       'gl_account',                     jsonb_build_object('target_entity','gl_account','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'supplier_posting_override'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );



-- 100_master/022_customer_block.sql
-- Purpose: Register master.customer_block as customer_block entity.
-- Idempotent: conflict-updating upserts

-- 1+2. entity/entity_version extracted to 006_domain_entities.sql

-- 3. control.entity_field
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('block_type',   'block_type',   'Block Type',   'text',            'one',         NULL::text, true,  true,  NULL::jsonb, 10),
    ('block_reason', 'block_reason', 'Block Reason', 'text',            'one',         NULL::text, true,  false, NULL::jsonb, 20),
    ('blocked_at',   'blocked_at',   'Blocked At',   'datetime',        'one',         NULL::text, true,  true,  NULL::jsonb, 30),
    ('is_active',    'is_active',    'Active',       'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb, 40),
    ('lifted_at',    'lifted_at',    'Lifted At',    'datetime',        'zero_or_one', NULL::text, false, true,  NULL::jsonb, 50),
    ('lift_reason',  'lift_reason',  'Lift Reason',  'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb, 60),
    ('notes',        'notes',        'Notes',        'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb, 70),
    ('status',       'status',       'Status',       'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb, 80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'customer_block' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET origin = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'customer_block'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'is_active'
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');



-- 1+2. entity/entity_version extracted to 006_domain_entities.sql

-- 3. control.entity_field
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_id',       'supplier_id',       'Supplier',       'uuid',            'one',         NULL::text, true,  true,  NULL::jsonb, 10),
    ('commodity_category_id', 'commodity_category_id', 'Commodity Category', 'uuid',            'one',         NULL::text, true,  true,  NULL::jsonb, 20),
    ('is_primary',        'is_primary',        'Primary',        'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb, 30),
    ('effective_from',    'effective_from',    'Effective From', 'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb, 40),
    ('effective_until',   'effective_until',   'Effective Until','date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb, 50),
    ('notes',             'notes',             'Notes',          'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb, 60),
    ('status',            'status',            'Status',         'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb, 70)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_commodity_category' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



UPDATE control.entity_field ef
SET label            = f.label,
    data_type        = f.data_type,
    cardinality      = f.cardinality,
    origin           = 'standard',
    is_required      = f.is_required,
    is_filterable    = f.is_filterable,
    is_searchable    = f.is_searchable,
    is_read_only     = f.is_read_only,
    validation       = f.validation,
    reference_config = f.reference_config,
    sort_order       = f.sort_order,
    updated_at       = now(),
    updated_by       = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_id'::text,       'Supplier',       'uuid',            'one',         true,  true,  false, false, '{"ref_entity":"supplier"}'::jsonb,       '{"target_entity":"supplier","target_field":"id","display_field":"supplier_code","picker":{"code_field":"supplier_code","show_code":false}}'::jsonb, 10),
    ('commodity_category_id',       'Commodity Category', 'uuid',            'one',         true,  true,  false, false, '{"ref_entity":"commodity_category"}'::jsonb, '{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, 20),
    ('is_primary',              'Primary',        'boolean',         'one',         true,  true,  false, false, NULL::jsonb,                               NULL::jsonb, 30),
    ('effective_from',          'Effective From', 'date',            'zero_or_one', false, true,  false, false, NULL::jsonb,                               NULL::jsonb, 40),
    ('effective_until',         'Effective Until','date',            'zero_or_one', false, true,  false, false, NULL::jsonb,                               NULL::jsonb, 50),
    ('notes',                   'Notes',          'text',            'zero_or_one', false, false, true,  false, NULL::jsonb,                               NULL::jsonb, 60),
    ('status',                  'Status',         'lifecycle_state', 'one',         true,  true,  true,  true,  NULL::jsonb,                               NULL::jsonb, 70)
) AS f(name, label, data_type, cardinality, is_required, is_filterable, is_searchable,
       is_read_only, validation, reference_config, sort_order)
WHERE ef.entity_version_id = ev.id
  AND f.name = ef.name
  AND e.entity_code = 'supplier_commodity_category'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;



UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'supplier_commodity_category'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.name IN ('notes','status')
  AND ef.is_searchable = false;



-- 3. control.entity_field
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    is_searchable, validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('id',                  'id',                  'ID',                 'uuid',            'one',         NULL::text,                   true,  false, false, NULL::jsonb,   1),
    ('tenant_id',           'tenant_id',           'Tenant',             'uuid',            'one',         NULL::text,                   true,  false, false, NULL::jsonb,   2),
    ('business_partner_id', 'business_partner_id', 'Business Partner',   'uuid',            'one',         NULL::text,                   true,  true,  false, NULL::jsonb,   5),
    ('role_kind',           'role_kind',           'Role Kind',          'text',            'one',         NULL::text,                   true,  true,  true,  NULL::jsonb,  10),
    ('role_label',          'role_label',          'Role',               'text',            'one',         NULL::text,                   true,  true,  true,  NULL::jsonb,  20),
    ('role_entity_code',    'role_entity_code',    'Role Entity',        'text',            'one',         NULL::text,                   true,  true,  false, NULL::jsonb,  30),
    ('role_record_id',      'role_record_id',      'Role Record',        'uuid',            'one',         NULL::text,                   true,  false, false, NULL::jsonb,  40),
    ('role_code',           'role_code',           'Role Code',          'text',            'one',         NULL::text,                   true,  true,  true,  NULL::jsonb,  50),
    ('role_type',           'role_type',           'Role Type',          'text',            'zero_or_one', NULL::text,                   false, true,  true,  NULL::jsonb,  60),
    ('status',              'status',              'Status',             'lifecycle_state', 'one',         NULL::text,                   true,  true,  false, NULL::jsonb,  70),
    ('is_active',           'is_active',           'Active',             'boolean',         'one',         NULL::text,                   true,  true,  false, NULL::jsonb,  80),
    ('active_scope_count',  'active_scope_count',  'Active Scope',       'integer',         'one',         NULL::text,                   true,  false, false, NULL::jsonb,  90),
    ('company_scope_count', 'company_scope_count', 'Company Scopes',     'integer',         'one',         NULL::text,                   true,  false, false, NULL::jsonb, 100),
    ('blocked_scope_count', 'blocked_scope_count', 'Blocked Scopes',     'integer',         'one',         NULL::text,                   true,  false, false, NULL::jsonb, 110),
    ('is_payment_ready',    'is_payment_ready',    'Payment Ready',      'boolean',         'zero_or_one', NULL::text,                   false, true,  false, NULL::jsonb, 120),
    ('is_key_account',      'is_key_account',      'Key Account',        'boolean',         'zero_or_one', NULL::text,                   false, true,  false, NULL::jsonb, 130),
    ('risk_rating',         'risk_rating',         'Risk Rating',        'enum',            'zero_or_one', 'master.credit_rating'::text, false, true,  false, NULL::jsonb, 140),
    ('is_blocked',          'is_blocked',          'Blocked',            'boolean',         'one',         NULL::text,                   true,  true,  false, NULL::jsonb, 150),
    ('primary_currency_code','primary_currency_code','Currency',         'text',            'zero_or_one', NULL::text,                   false, true,  false, NULL::jsonb, 160),
    ('open_document_count', 'open_document_count', 'Open Documents',     'integer',         'zero_or_one', NULL::text,                   false, false, false, NULL::jsonb, 170),
    ('ytd_amount',          'ytd_amount',          'YTD Amount',         'decimal',         'zero_or_one', NULL::text,                   false, false, false, NULL::jsonb, 180),
    ('ytd_currency_code',   'ytd_currency_code',   'YTD Currency',       'text',            'zero_or_one', NULL::text,                   false, false, false, NULL::jsonb, 190),
    ('display_order',       'display_order',       'Display Order',      'integer',         'one',         NULL::text,                   true,  false, false, NULL::jsonb, 200),
    ('created_at',          'created_at',          'Created',            'timestamptz',     'one',         NULL::text,                   true,  false, false, NULL::jsonb, 210),
    ('updated_at',          'updated_at',          'Updated',            'timestamptz',     'zero_or_one', NULL::text,                   false, false, false, NULL::jsonb, 220)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.entity_code = 'v_business_partner_role_summary'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    is_searchable, validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('id',                         'id',                         'ID',                  'uuid',            'one',         NULL::text, true,  false, false, NULL::jsonb,  1),
    ('tenant_id',                  'tenant_id',                  'Tenant',              'uuid',            'one',         NULL::text, true,  false, false, NULL::jsonb,  2),
    ('code',                       'code',                       'BP Code',             'text',            'one',         NULL::text, true,  true,  false, NULL::jsonb, 10),
    ('name',                       'name',                       'Name',                'text',            'one',         NULL::text, true,  true,  false, NULL::jsonb, 20),
    ('display_name',               'display_name',               'Display Name',        'text',            'zero_or_one', NULL::text, false, false, false, NULL::jsonb, 30),
    ('role_summary',               'role_summary',               'Roles',               'text',            'one',         NULL::text, true,  true,  true,  NULL::jsonb, 35),
    ('role_count',                 'role_count',                 'Role Count',          'integer',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 36),
    ('role_kinds',                 'role_kinds',                 'Role Kinds',          'text_array',      'many',        NULL::text, false, true,  true,  NULL::jsonb, 37),
    ('role_codes',                 'role_codes',                 'Role Codes',          'text',            'zero_or_one', NULL::text, false, true,  true,  NULL::jsonb, 38),
    ('has_supplier_role',          'has_supplier_role',          'Supplier',            'boolean',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 39),
    ('has_customer_role',          'has_customer_role',          'Customer',            'boolean',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 40),
    ('is_dual_role',               'is_dual_role',               'Dual Role',           'boolean',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 41),
    ('partner_category',           'partner_category',           'Category',            'enum',            'one',         'master.business_partner_category'::text, true, true, false, NULL::jsonb, 45),
    ('legal_name',                 'legal_name',                 'Legal Name',          'text',            'zero_or_one', NULL::text, false, false, false, NULL::jsonb, 50),
    ('legal_form',                 'legal_form',                 'Legal Form',          'enum',            'zero_or_one', 'master.legal_form'::text, false, true, false, NULL::jsonb, 60),
    ('registration_no',            'registration_no',            'Registration No.',    'text',            'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 70),
    ('registration_country_code',  'registration_country_code',  'Country',             'text',            'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 80),
    ('tax_residence_country_code', 'tax_residence_country_code', 'Tax Country',         'text',            'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 90),
    ('supplier_code',              'supplier_code',              'Supplier Code',       'text',            'zero_or_one', NULL::text, false, true,  true,  NULL::jsonb, 100),
    ('supplier_type',              'supplier_type',              'Supplier Type',       'enum',            'zero_or_one', 'master.supplier_type'::text, false, true, false, NULL::jsonb, 110),
    ('supplier_status',            'supplier_status',            'Supplier Status',     'lifecycle_state', 'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 120),
    ('is_payment_ready',           'is_payment_ready',           'Payment Ready',       'boolean',         'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 130),
    ('customer_code',              'customer_code',              'Customer Code',       'text',            'zero_or_one', NULL::text, false, true,  true,  NULL::jsonb, 140),
    ('customer_type',              'customer_type',              'Customer Type',       'enum',            'zero_or_one', 'master.customer_type'::text, false, true, false, NULL::jsonb, 150),
    ('customer_status',            'customer_status',            'Customer Status',     'lifecycle_state', 'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 160),
    ('is_key_account',             'is_key_account',             'Key Account',         'boolean',         'zero_or_one', NULL::text, false, true,  false, NULL::jsonb, 170),
    ('risk_rating',                'risk_rating',                'Risk Rating',         'enum',            'zero_or_one', 'master.credit_rating'::text, false, true, false, NULL::jsonb, 180),
    ('company_scope_count',        'company_scope_count',        'Company Scopes',      'integer',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 190),
    ('active_scope_count',         'active_scope_count',         'Active Scopes',       'integer',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 200),
    ('blocked_scope_count',        'blocked_scope_count',        'Blocked Scopes',      'integer',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 210),
    ('is_blocked',                 'is_blocked',                 'Blocked',             'boolean',         'one',         NULL::text, true,  true,  false, NULL::jsonb, 220),
    ('status',                     'status',                     'Status',              'lifecycle_state', 'one',         NULL::text, true,  true,  false, NULL::jsonb, 230),
    ('search_text',                'search_text',                'Search',              'text',            'one',         NULL::text, true,  false, true,  NULL::jsonb, 900),
    ('created_at',                 'created_at',                 'Created',             'timestamptz',     'one',         NULL::text, true,  false, false, NULL::jsonb, 910),
    ('created_by',                 'created_by',                 'Created By',          'uuid',            'one',         NULL::text, true,  false, false, NULL::jsonb, 920),
    ('updated_at',                 'updated_at',                 'Updated',             'timestamptz',     'zero_or_one', NULL::text, false, false, false, NULL::jsonb, 930),
    ('updated_by',                 'updated_by',                 'Updated By',          'uuid',            'zero_or_one', NULL::text, false, false, false, NULL::jsonb, 940)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.entity_code = 'v_business_partner_app_index'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Keep the current list resolver's sort_order-based column order aligned with
-- the seeded list_columns order.
UPDATE control.entity_field ef
SET sort_order = 72
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master'
  AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.name = 'legal_form'
  AND ef.sort_order IS DISTINCT FROM 72;





-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field (26 fields) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Group A: Identity / Classification (10-30)
-- Group B: Counterparty & Dates     (40-60)
-- Group C: Currency & Amounts       (70-115)
-- Group D: References & Terms       (120-145)
-- Group E: Matching & Hold          (150-165)
-- Group F: Dimensions & Fiscal      (200-230)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- Ã¢â€â‚¬Ã¢â€â‚¬ A: Identity & Classification Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('code',                     'code',                    'Code',               'text',           'one',         NULL::text,                                   true,  true,  '{"max_length":50}'::jsonb,             10),
    ('invoice_type',             'invoice_type',            'Invoice Type',       'enum',           'one',         'document.purchase_invoice_type'::text,       true,  true,  NULL::jsonb,                            20),
    ('status',                   'status',                  'Status',             'lifecycle_state','one',         NULL::text,                                   true,  true,  NULL::jsonb,                            30),
    ('company_code_id',          'company_code_id',         'Company Code',       'reference',      'one',         NULL::text,                                   true,  true,  '{"ref_entity":"company_code","display_field":"name"}'::jsonb, 35),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ B: Counterparty & Dates Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('supplier_id',              'supplier_id',             'Supplier',           'reference',      'one',         NULL::text,                                   true,  true,  '{"ref_entity":"supplier","display_field":"name"}'::jsonb,     40),
    ('supplier_invoice_date',    'supplier_invoice_date',   'Supplier Invoice Date','date',         'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            45),
    ('posting_date',             'posting_date',            'Posting Date',       'date',           'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            55),
    ('due_date',                 'due_date',                'Due Date',           'date',           'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                            60),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ C: Currency & Amounts Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('currency_code',            'currency_code',           'Currency',           'text',           'one',         NULL::text,                                   true,  true,  '{"max_length":3}'::jsonb,              70),
    ('total_amount',             'total_amount',            'Gross Amount',       'decimal',        'one',         NULL::text,                                   true,  false, '{"min":0}'::jsonb,                     80),
    ('tax_mode',                 'tax_mode',                'Tax Mode',           'lookup',         'zero_or_one', 'document.purchase_invoice_tax_mode'::text,   false, true,  NULL::jsonb,                            85),
    ('tax_mode_source',          'tax_mode_source',         'Tax Mode Source',    'lookup',         'zero_or_one', 'document.purchase_invoice_tax_mode_source'::text, false, true, NULL::jsonb,                       86),
    ('tax_amount',               'tax_amount',              'Tax Amount',         'decimal',        'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                     90),
    ('withholding_tax_amount',   'withholding_tax_amount',  'WHT Amount',         'decimal',        'one',         NULL::text,                                   false, false, '{"min":0}'::jsonb,                     95),
    ('paid_amount',              'paid_amount',             'Paid Amount',        'decimal',        'one',         NULL::text,                                   false, false, '{"min":0}'::jsonb,                    102),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ D: Source, References & Terms Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('invoice_source',           'invoice_source',          'Invoice Source',     'enum',           'one',         'document.purchase_invoice_source'::text,     true,  true,  NULL::jsonb,                           110),
    ('supplier_invoice_number',   'supplier_invoice_number', 'Supplier Invoice No.', 'text',           'zero_or_one', NULL::text,                                   false, false, '{"max_length":100}'::jsonb,            120),
    ('payment_term_id',          'payment_term_id',         'Payment Terms',      'reference',      'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"payment_term"}'::jsonb, 140),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ E: Matching & Hold Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('match_type',               'match_type',              'Match Type',         'enum',           'one',         'document.invoice_match_type'::text,          true,  true,  NULL::jsonb,                           150),
    ('match_status',             'match_status',            'Match Status',       'enum',           'one',         'document.invoice_match_status'::text,        false, true,  NULL::jsonb,                           155),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ F: Fiscal (dimensions moved to accounting_distribution) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('fiscal_year',              'fiscal_year',             'Fiscal Year',        'integer',        'one',         NULL::text,                                   true,  true,  NULL::jsonb,                            220),
    ('period_number',            'period_number',           'Period',             'integer',        'one',         NULL::text,                                   true,  true,  '{"min":1,"max":16}'::jsonb,             225)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Extended fields missing from v1 registration Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- These columns exist on document.purchase_invoice but were not initially seeded.
INSERT INTO control.entity_field (
    entity_version_id,
    name, column_name, label, data_type,
    cardinality, origin, enum_domain_code,
    is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- Commitment reference (P2P linkage)
    ('commitment_id',            'commitment_id',            'Commitment/PO',      'reference', 'zero_or_one', NULL::text, false, true,  '{"ref_entity":"purchase_order"}'::jsonb,              43),
    -- Dates not in original registration
    ('received_date',            'received_date',            'Received Date',      'date',      'one',         NULL::text, true,  false, NULL::jsonb,                                          57),
    ('baseline_date',            'baseline_date',            'Baseline Date',      'date',      'zero_or_one', NULL::text, false, false, NULL::jsonb,                                          62),
    -- FX
    ('base_currency_code',       'base_currency_code',       'Base Currency',      'text',      'one',         NULL::text, true,  true,  '{"max_length":3}'::jsonb,                            72),
    ('exchange_rate',            'exchange_rate',            'Exchange Rate',      'decimal',   'zero_or_one', NULL::text, false, false, '{"min":0}'::jsonb,                                   74),
    -- Derived totals (Phase 1 reset â€” discount/freight/misc + retention_pct
    -- + payment_method_id + header dimensions + notes + address-snapshot FKs
    -- were dropped from document.purchase_invoice; see 01e_tables_invoice.sql:148-149)
    ('payable_amount',           'payable_amount',           'Payable Amount',     'decimal',   'one',         NULL::text, false, true,  '{"min":0}'::jsonb,                                  107),
    ('advance_deduction_amount', 'advance_deduction_amount', 'Advance Deduction',  'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                  109),
    ('retention_amount',         'retention_amount',         'Retention Amount',   'decimal',   'one',         NULL::text, false, false, '{"min":0}'::jsonb,                                  112),
    -- Tags (metadata) only â€” no free-form notes column post-reset
    ('tags',                     'tags',                     'Tags',               'json',      'zero_or_one', NULL::text, false, false, NULL::jsonb,                                         175),
    -- Budget result
    ('budget_check_result',      'budget_check_result',      'Budget Check',       'text',      'zero_or_one', NULL::text, false, false, NULL::jsonb,                                         205)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- â”€â”€â”€ Header bill-side address pickers: filter + dependent_filter wiring â”€â”€â”€â”€â”€
-- The compiler reads picker filters / dependent_filter from reference_config
-- and lookup_config â€” not from validation. Set them here so the runtime-options
-- route narrows by (owner, purpose) instead of returning every address-link
-- row for the owner.
UPDATE control.entity_field ef
   SET reference_config = '{"display_field":"name","label_field":"name","code_field":"code","description_field":"formatted_address","value_field":"address_id"}'::jsonb,
       lookup_config    = '{"filters":{"purpose":"bill_to,default"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"none"},"default_order":["-is_primary","code","id"]}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'billto_address_id';

UPDATE control.entity_field ef
   SET reference_config = '{"display_field":"name","label_field":"name","code_field":"code","description_field":"formatted_address","value_field":"address_id"}'::jsonb,
       lookup_config    = '{"filters":{"purpose":"bill_from,default"},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"},"default_order":["-is_primary","code","id"]}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'billfrom_address_id';

UPDATE control.entity_field ef
   SET reference_config = '{"display_field":"name","label_field":"name","code_field":"code","description_field":"formatted_address","value_field":"address_id"}'::jsonb,
       lookup_config    = '{"filters":{"purpose":"remit_to,default"},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"},"default_order":["-is_primary","code","id"]}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'remitto_address_id';


-- â”€â”€â”€ on_source_change: stale-value behavior for the bill/remit address pickers â”€â”€â”€â”€â”€
-- Spec: docs/specs/entity_field_defaults.md Â§6  +  purchase_invoice_field_design.md Â§4.x
-- Pairs 1:1 with the dependent_filter UPDATEs above. CI verifier asserts this pairing.
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources', jsonb_build_array('company_code_id'),
            'action',  'rederive',
            'mode',    'always',
            'resolver','picker.first_option',
            'layers',  jsonb_build_array('client_on_change', 'server_on_save'),
            'message', 'Selected default bill-to address because company code changed'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'billto_address_id';

UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources', jsonb_build_array('supplier_id'),
            'action',  'rederive',
            'mode',    'always',
            'resolver','picker.first_option',
            'layers',  jsonb_build_array('client_on_change', 'server_on_save'),
            'message', 'Selected default address because supplier changed'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'billfrom_address_id';

UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources', jsonb_build_array('supplier_id'),
            'action',  'rederive',
            'mode',    'always',
            'resolver','picker.first_option',
            'layers',  jsonb_build_array('client_on_change', 'server_on_save'),
            'message', 'Selected default address because supplier changed'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'remitto_address_id';


-- Ã¢â€â‚¬Ã¢â€â‚¬ Fix ref_entity: "supplier" on already-seeded rows (was "vendor") Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET validation = '{"ref_entity":"supplier","display_field":"name"}'::jsonb
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'supplier_id'
  AND ef.validation->>'ref_entity' = 'vendor';



-- Ã¢â€â‚¬Ã¢â€â‚¬ Fix origin for existing rows (idempotent) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';



-- Ã¢â€â‚¬Ã¢â€â‚¬ Mark searchable fields (idempotent) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- document_no (invoice number like INV-A1-0001), supplier_invoice_number, description
-- are the natural free-text search targets for the invoice list.
UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('code', 'supplier_invoice_number', 'description');



-- Folded in from retired patch seeds: keep canonical invoice field names/labels.
UPDATE control.entity_field ef
   SET label = 'Invoice Name',
       validation = '{"max_length":200}'::jsonb,
       constraints = '{"max_length":200}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'description'
   AND ef.tenant_id IS NULL;



UPDATE control.entity_field ef
   SET runtime_enabled = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document'
  AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.name IN ('gross_amount', 'vendor_invoice_ref', 'default_shipto_site_id')
  AND ef.tenant_id IS NULL;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 3b. Full-coverage entity fields Ã¢â‚¬â€ all remaining business columns Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Excluded (intentionally): id, tenant_id, code, name (system identity);
-- term_snapshot, dimension_set_id, ap_je_id, workflow_request_id (internal);
-- is_posted, is_active (derived/GENERATED); posted_at/by, approved_at/by,
-- status_changed_at/by, created_at/by, updated_at/by (audit trail);
-- line_count, metadata (system-managed counters/opaque store).
-- budget_check_result requires lookup domain: document.invoice_budget_check_result
--   with values: PASSED, WARNED, OVERRIDE, BLOCKED, EXEMPT
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- Phase 1 reset removed: is_credit_note, discount/freight/misc/retention_pct,
    -- payment_method_id, notes, is_reversal, reversal_of_id, budget_allocation_id,
    -- profit_center_id, site_id. See 01e_tables_invoice.sql:148-149.
    -- Ã¢â€â‚¬Ã¢â€â‚¬ Counterparty & Dates additions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('commitment_id',          'commitment_id',           'PO / Commitment',    'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"purchase_order"}'::jsonb, 42),
    ('received_date',          'received_date',           'Received Date',      'date',      'one',         NULL::text,                                   true,  true,  NULL::jsonb,                          47),
    ('baseline_date',          'baseline_date',           'Baseline Date',      'date',      'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                          57),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ Currency & Amounts additions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('base_currency_code',     'base_currency_code',      'Base Currency',      'text',      'one',         NULL::text,                                   true,  true,  '{"max_length":3}'::jsonb,            72),
    ('exchange_rate',          'exchange_rate',           'Exchange Rate',      'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                   74),
    ('payable_amount',         'payable_amount',          'Payable Amount',     'decimal',   'one',         NULL::text,                                   false, true,  '{"computed":true}'::jsonb,          103),
    ('outstanding_amount',     'outstanding_amount',      'Outstanding',         'decimal',   'one',         NULL::text,                                   false, true,  '{"computed":true}'::jsonb,          104),
    ('advance_deduction_amount','advance_deduction_amount','Advance Deduction', 'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                  105),
    ('retention_amount',       'retention_amount',        'Retention Amount',   'decimal',   'zero_or_one', NULL::text,                                   false, false, '{"min":0}'::jsonb,                  107),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ Tags + Budget Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('tags',                   'tags',                    'Tags',               'text',      'many',        NULL::text,                                   false, true,  NULL::jsonb,                         147),
    ('budget_check_result',    'budget_check_result',     'Budget Check',       'enum',      'zero_or_one', 'document.invoice_budget_check_result'::text, false, true,  NULL::jsonb,                         168)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Patch: rename 'Vendor Ref' / 'Vendor Invoice No.' Ã¢â€ â€™ 'Supplier Invoice No.' on already-seeded rows Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
   SET name = 'supplier_invoice_number',
       column_name = 'supplier_invoice_number',
       label = 'Supplier Invoice No.',
       validation = COALESCE(ef.validation, '{"max_length":100}'::jsonb),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN ('supplier_invoice_number', 'vendor_invoice_ref')
   AND ef.tenant_id IS NULL;


-- Mark generated purchase invoice monetary totals as computed/read-only for UI/validators.
-- payable_amount and outstanding_amount are PostgreSQL GENERATED ALWAYS AS STORED
-- columns (see document/01e_tables_invoice.sql Â§9). compute_mode='generated'
-- satisfies ef_computed_chk (CHECK: NOT is_computed OR compute_mode IS NOT NULL).
UPDATE control.entity_field ef
   SET is_read_only = true,
       is_computed = true,
       compute_mode = 'generated',
       validation = CASE
           WHEN ef.validation ? 'computed' THEN ef.validation
           ELSE COALESCE(ef.validation, '{}'::jsonb) || '{"computed":true}'::jsonb
       END
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
  AND ef.tenant_id IS NULL
  AND ef.name IN ('payable_amount', 'outstanding_amount');


-- Add missing header fields added by DDL/runtime.
INSERT INTO control.entity_field (
    entity_version_id,
    name, column_name, label, data_type,
    cardinality, origin, enum_domain_code,
    is_required, is_filterable, validation, sort_order, created_by)
SELECT
    ev.id,
    f.name, f.column_name, f.label, f.data_type,
    f.cardinality, 'standard', f.enum_domain_code,
    f.is_required, f.is_filterable,
    f.validation, f.sort_order,
    '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- subtotal_amount removed â€” column dropped from document.purchase_invoice
    -- (see 01e_tables_invoice.sql:148-149)
    ('row_version',    'row_version',    'Row Version',    'bigint',  'one', NULL::text, false, false, NULL::jsonb,                             990)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document'
  AND e.table_name = 'purchase_invoice'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

-- subtotal_amount: trigger-maintained by trg_pil_sync_header (rolls up line.net_amount).
-- payable_amount, outstanding_amount: PG GENERATED ALWAYS AS STORED.
-- tax_amount, withholding_tax_amount: PC-derived roll-up; flat value retained for
-- read-only legacy compatibility â€” DO NOT WRITE DIRECTLY OUTSIDE BACKFILL (WS-COMPAT).
-- compute_mode must be non-null when is_computed=true (ef_computed_chk).
UPDATE control.entity_field ef
   SET is_read_only = true,
       is_computed = (ef.name IN (
           'subtotal_amount', 'payable_amount', 'outstanding_amount',
           'tax_amount', 'withholding_tax_amount'
       )),
       compute_mode = CASE ef.name
           WHEN 'subtotal_amount'         THEN 'trigger'
           WHEN 'payable_amount'          THEN 'generated'
           WHEN 'outstanding_amount'      THEN 'generated'
           WHEN 'tax_amount'              THEN 'pricing_components'
           WHEN 'withholding_tax_amount'  THEN 'pricing_components'
           ELSE ef.compute_mode
       END,
       validation = CASE
           WHEN ef.validation ? 'computed' THEN ef.validation
           ELSE COALESCE(ef.validation, '{}'::jsonb) || '{"computed":true}'::jsonb
       END
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.tenant_id IS NULL
   AND ef.name IN (
       'subtotal_amount', 'payable_amount', 'outstanding_amount',
       'tax_amount', 'withholding_tax_amount'
   );

-- row_version is incremented by trg_pi_row_version on every UPDATE
-- (see document/01z_row_version.sql). compute_mode='trigger' satisfies ef_computed_chk.
UPDATE control.entity_field ef
   SET is_read_only = true,
       is_computed = true,
       compute_mode = 'trigger',
       validation = CASE
           WHEN ef.validation ? 'computed' THEN ef.validation
           ELSE COALESCE(ef.validation, '{}'::jsonb) || '{"computed":true}'::jsonb
       END
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.tenant_id IS NULL
   AND ef.name = 'row_version';


-- Purchase Order field/create-form metadata moved to:
--   042i_po_purchase_order_contract.sql
-- Keep this file focused on generic table-owned entity_field coverage.

-- Receipt â€” shell + field discipline (P2P plan Plan 3a)
-- Hide every system-managed / computed column from the create surface and
-- group the remaining 9 user-input fields into General / Receiving / Notes.
-- The Receipt POC is the proving ground for the same pattern applied to
-- Service Sheet, POC, DN, and PR in subsequent batches.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Block 1 â€” hide system-managed / computed / lifecycle / versioning fields.
-- These should never appear on the /new form. status is server-forced to
-- 'draft' on insert; total_amount rolls up from receipt_line; fiscal_year /
-- period_number resolve from posting_date; accrual_je_id is set when posted.
UPDATE control.entity_field ef
SET
    is_required = false,
    editability = jsonb_build_object(
        'editableOnCreate', false,
        'editableOnEdit',   false
    ),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'receipt'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      -- Auto-generated identifiers
      'code', 'name',
      -- Auto-resolved fiscal / accounting state
      'posting_date', 'base_currency_code', 'exchange_rate',
      'fiscal_year', 'period_number', 'accrual_je_id',
      -- Computed totals (roll up from receipt_line)
      'total_amount',
      -- Approval state (lifecycle owns)
      'workflow_request_id', 'approved_at', 'approved_by',
      'status', 'status_changed_at', 'status_changed_by',
      'terminal_status', 'status_source',
      -- Universal versioning columns
      'row_version', 'version_number', 'previous_version_id',
      'is_current_version', 'supersedes_at',
      -- Server-only metadata blob
      'metadata'
  );

-- Block 2 â€” unblock the 9 user-input fields, assign their group_keys, and
-- reset ui_type to let the form-renderer pick the editor from data_type.
-- PG UPDATE...FROM cannot inner-join a CTE/VALUES against the target via
-- ON; use a comma-separated FROM with the join condition in WHERE instead.
UPDATE control.entity_field ef
SET
    is_read_only = false,
    ui_type      = NULL,
    group_key    = f.gk,
    updated_at   = now()
FROM (VALUES
    ('commitment_id',          'general'),
    ('delivery_note_id',       'general'),
    ('supplier_id',            'general'),
    ('company_code_id',        'general'),
    ('received_date',          'general'),
    ('currency_code',          'general')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'receipt'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Service Sheet â€” shell + field discipline (P2P plan Plan 3c)
-- Same template as Receipt. 12 user-input fields grouped into General /
-- Period / Addresses / Notes. Receipt-number / fiscal_year / period_number /
-- base_currency_code are auto-resolved by the records create handler (see
-- records.route.ts Â§receipt|service_sheet branch).
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Block 1 â€” hide system-managed / computed / lifecycle / versioning fields.
UPDATE control.entity_field ef
SET
    is_required = false,
    editability = jsonb_build_object(
        'editableOnCreate', false,
        'editableOnEdit',   false
    ),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'service_sheet'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'code', 'name', 'service_sheet_number',
      'posting_date', 'base_currency_code', 'exchange_rate',
      'fiscal_year', 'period_number', 'accrual_je_id',
      'total_amount',
      'accepted_by', 'accepted_at',
      'workflow_request_id', 'approved_at', 'approved_by',
      'status', 'status_changed_at', 'status_changed_by',
      'terminal_status', 'status_source',
      'row_version', 'version_number', 'previous_version_id',
      'is_current_version', 'supersedes_at',
      'metadata'
  );

-- Block 2 â€” unblock the 12 user-input fields, assign group_keys.
UPDATE control.entity_field ef
SET
    is_read_only = false,
    ui_type      = NULL,
    group_key    = f.gk,
    updated_at   = now()
FROM (VALUES
    ('commitment_id',         'general'),
    ('supplier_id',           'general'),
    ('company_code_id',       'general'),
    ('service_date',          'general'),
    ('currency_code',         'general'),
    ('service_period_from',   'period'),
    ('service_period_to',     'period')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'service_sheet'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Purchase Order Confirmation â€” shell + field discipline (P2P plan Plan 3 Â§D)
-- 10 user-input fields. confirmation_number auto-allocated by the records
-- create handler (DOC_NUMBER_COLS).
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

UPDATE control.entity_field ef
SET is_required = false,
    editability = jsonb_build_object('editableOnCreate', false, 'editableOnEdit', false),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_order_confirmation'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'code', 'name', 'confirmation_number',
      'amendment_commitment_id',
      'metadata',
      'status',
      'terminal_status', 'status_source',
      'row_version', 'version_number', 'previous_version_id',
      'is_current_version', 'supersedes_at'
  );

UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = f.gk, updated_at = now()
FROM (VALUES
    ('commitment_id',                'general'),
    ('supplier_id',                  'general'),
    ('company_code_id',              'general'),
    ('document_date',                'general'),
    ('supplier_reference_number',    'general'),
    ('supplier_confirmation_date',   'general'),
    ('confirmation_type',            'general'),
    ('currency_code',                'general'),
    ('confirmed_total_amount',       'general'),
    ('notes',                        'notes')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_order_confirmation'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Delivery Note â€” shell + field discipline (P2P plan Plan 3 Â§D)
-- 14 user-input fields. delivery_note_number auto-allocated. total_amount /
-- is_fully_receipted are computed from receipt fulfillment; inspection_status
-- is set by the inspection workflow.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

UPDATE control.entity_field ef
SET is_required = false,
    editability = jsonb_build_object('editableOnCreate', false, 'editableOnEdit', false),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'delivery_note'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'code', 'name', 'delivery_note_number',
      'total_amount', 'is_fully_receipted', 'inspection_status',
      'metadata',
      'status',
      'terminal_status', 'status_source',
      'row_version', 'version_number', 'previous_version_id',
      'is_current_version', 'supersedes_at'
  );

UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = f.gk, updated_at = now()
FROM (VALUES
    ('commitment_id',              'general'),
    ('supplier_id',                'general'),
    ('company_code_id',            'general'),
    ('supplier_delivery_note_no',  'general'),
    ('supplier_dispatch_date',     'general'),
    ('delivery_date',              'general'),
    ('expected_arrival_date',      'general'),
    ('delivery_site_id',           'general'),
    ('delivery_warehouse_id',      'general'),
    ('currency_code',              'general'),
    ('bill_of_lading_no',          'logistics'),
    ('tracking_number',            'logistics'),
    ('carrier_name',               'logistics'),
    ('transport_mode',             'logistics'),
    ('requires_inspection',        'logistics'),
    ('notes',                      'notes')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'delivery_note'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Purchase Requisition â€” shell + field discipline (P2P plan Plan 3 Â§D)
-- 14 user-input fields. requisition_number auto-allocated. base_currency_code
-- + fiscal_year + requested_by auto-resolved by the records create handler.
-- Budget/encumbrance/conversion fields are set by downstream workflows.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

UPDATE control.entity_field ef
SET is_required = false,
    editability = jsonb_build_object('editableOnCreate', false, 'editableOnEdit', false),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_requisition'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'code', 'name', 'requisition_number',
      'base_currency_code', 'exchange_rate',
      'budget_check_result', 'encumbrance_je_id',
      'fiscal_year', 'period_number',
      'approved_at', 'approved_by',
      'workflow_request_id',
      'metadata',
      'status', 'is_active', 'status_changed_at', 'status_changed_by',
      'terminal_status', 'status_source',
      'row_version', 'version_number', 'previous_version_id',
      'is_current_version', 'supersedes_at'
  );

UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = f.gk, updated_at = now()
FROM (VALUES
    ('requisition_type',         'general'),
    ('description',              'general'),
    ('priority',                 'general'),
    ('requested_by',             'general'),
    ('document_date',            'general'),
    ('required_by_date',         'general'),
    ('suggested_supplier_ids',   'general'),
    ('company_code_id',          'general'),
    ('currency_code',            'general'),
    ('total_amount',             'general'),
    ('tags',                     'notes')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_requisition'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;



-- â”€â”€ Batch 6A.7 â€” journal_entry coverage expansion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- The 9-field explicit block below covers the create surface. This block
-- flags server-managed audit / reversal / period-override / dispatcher
-- fields so they render as read-only detail rows and do not leak into
-- create/edit forms. Also marks total_debit / total_credit / line_count as
-- computed by trigger to prevent direct UI writes overriding the line
-- rollup contract.
UPDATE control.entity_field ef
SET is_required = false,
    editability = jsonb_build_object('editableOnCreate', false, 'editableOnEdit', false),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'source_doc_id', 'derived_from_je_id',
      'posting_rule_id', 'book_idempotency_key',
      'is_auto_reverse', 'auto_reverse_date',
      'reversed_by_id',
      'close_override_id', 'original_period_year', 'original_period_number',
      'prior_period_flag',
      'posted_at', 'posted_by'
  );

UPDATE control.entity_field ef
SET is_computed  = true,
    is_read_only = true,
    compute_mode = 'trigger',
    updated_at   = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('total_debit', 'total_credit', 'line_count');


-- â”€â”€ Batch 6A.6 â€” payment_entry_allocation coverage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- PEA has no explicit contract elsewhere; all rows come from the pg_catalog
-- auto-loop. This block groups the business columns and locks derived /
-- discount / FX / posting-frozen fields so the allocation drawer surfaces
-- them correctly.
UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = f.gk, updated_at = now()
FROM (VALUES
    ('payment_entry_id',            'general'),
    ('line_no',                     'general'),
    ('purchase_invoice_id',         'general'),
    ('commitment_id',               'general'),
    ('currency_code',               'general'),
    ('allocated_amount',            'amounts'),
    ('discount_amount',             'amounts'),
    ('withholding_tax_amount',      'amounts'),
    ('advance_recovery_amount',     'amounts'),
    ('retention_amount',            'amounts'),
    ('is_discount_taken',           'amounts'),
    ('discount_due_date',           'amounts'),
    ('payment_term_application_id', 'reference'),
    ('notes',                       'notes')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry_allocation'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;

-- net_payment_amount is GENERATED STORED; base_amount / exchange_rate /
-- fx_gain_loss / base_currency_code are frozen at posting time.
UPDATE control.entity_field ef
SET is_computed  = true,
    is_read_only = true,
    compute_mode = CASE ef.name
                     WHEN 'net_payment_amount' THEN 'generated'
                     ELSE 'service'
                   END,
    updated_at   = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry_allocation'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('net_payment_amount', 'base_amount', 'exchange_rate',
                  'base_currency_code', 'fx_gain_loss');


-- â”€â”€ Batch 6A.5 â€” journal_line_reference coverage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- JLR rows come from the pg_catalog auto-loop. Group business columns so
-- the reference picker surfaces allocated_amount / currency_code alongside
-- the ref_type / ref_doc_id natural key.
UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = f.gk, updated_at = now()
FROM (VALUES
    ('ref_type',            'general'),
    ('ref_doc_type',        'general'),
    ('ref_doc_id',          'general'),
    ('ref_doc_line_id',     'general'),
    ('ref_doc_number',      'general'),
    ('allocated_amount',    'amounts'),
    ('currency_code',       'amounts'),
    ('base_amount',         'amounts'),
    ('is_full_settlement',  'settlement'),
    ('settlement_date',     'settlement'),
    ('description',         'notes')
) AS f(name, gk),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_line_reference'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;

-- base_amount is computed at post time by the JE dispatcher.
UPDATE control.entity_field ef
SET is_computed  = true,
    is_read_only = true,
    compute_mode = 'service',
    updated_at   = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_line_reference'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'base_amount';


-- Ã¢â€â‚¬Ã¢â€â‚¬ 2. control.entity_field (9 fields) Ã¢â‚¬â€ entity/entity_version extracted to 006_domain_entities.sql Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable, is_searchable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',   'je_number',             'JE Number',       'text',    'one',         NULL::text,                                 true,  true,  true,  '{"max_length":50}'::jsonb,    10),
    ('status',        'status',                'Status',          'lifecycle_state', 'one',  NULL::text,                                 true,  true,  false, NULL::jsonb,                   20),
    ('entry_date',    'posting_date',          'Entry Date',      'date',    'one',         NULL::text,                                 true,  true,  false, NULL::jsonb,                   30),
    ('fiscal_period', 'period_number',         'Fiscal Period',   'integer', 'zero_or_one', NULL::text,                                 false, true,  false, NULL::jsonb,                   40),
    ('currency_code', 'transaction_currency',  'Currency',        'text',    'one',         NULL::text,                                 true,  true,  false, '{"max_length":3}'::jsonb,     50),
    ('total_debit',   'total_debit',           'Total Debit',     'decimal', 'one',         NULL::text,                                 true,  false, false, '{"min":0}'::jsonb,            60),
    ('total_credit',  'total_credit',          'Total Credit',    'decimal', 'one',         NULL::text,                                 true,  false, false, '{"min":0}'::jsonb,            70),
    ('source_type',   'source_doc_type',       'Source Type',     'enum',    'zero_or_one', 'document.je_source_doc_type'::text,        false, true,  false, NULL::jsonb,                   80),
    ('description',   'description',           'Description',     'text',    'one',         NULL::text,                                 true,  false, true,  '{"max_length":500}'::jsonb,   90)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ Fix origin for existing rows (idempotent) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET origin = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin = 'system';



-- Ã¢â€â‚¬Ã¢â€â‚¬ Enable full-text search on key text fields (idempotent) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- document_no (JE Number) and description are the natural free-text search
-- targets. Without is_searchable = true the records API ?q= param is silently
-- ignored because the ILIKE guard never fires.
UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'description');



-- Ã¢â€â‚¬Ã¢â€â‚¬ Fix column_name mismatches for existing rows (idempotent) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- The INSERT above used wrong column names that don't exist in document.journal_entry.
-- This UPDATE corrects them so the records route can SELECT the actual table columns.
UPDATE control.entity_field ef
SET column_name = CASE ef.name
    WHEN 'document_no'   THEN 'je_number'
    WHEN 'entry_date'    THEN 'posting_date'
    WHEN 'fiscal_period' THEN 'period_number'
    WHEN 'currency_code' THEN 'transaction_currency'
    WHEN 'source_type'   THEN 'source_doc_type'
    ELSE ef.column_name
END,
    data_type = CASE ef.name
    WHEN 'fiscal_period' THEN 'integer'
    ELSE ef.data_type
END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'journal_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('document_no', 'entry_date', 'fiscal_period', 'currency_code', 'source_type');



-- Ã¢â€â‚¬Ã¢â€â‚¬ 2. entity_version extracted to 006_domain_entities.sql Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field (14 fields) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('document_no',       'payment_number',   'Payment No.',       'text',      'one',         NULL::text,                                true,  true,  '{"max_length":50}'::jsonb,                10),
    ('status',            'status',           'Status',            'lifecycle_state', 'one',   NULL::text,                                true,  true,  NULL::jsonb,                               20),
    ('payment_type',      'payment_type',     'Payment Type',      'enum',      'one',         'document.payment_entry_type'::text,       true,  true,  NULL::jsonb,                               30),
    ('payment_direction', 'payment_direction','Direction',         'text',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               40),
    ('company_code_id',   'company_code_id',  'Company Code',      'reference', 'one',         NULL::text,                                true,  true,  '{"ref_entity":"company_code"}'::jsonb,    45),
    ('supplier_id',       'supplier_id',      'Supplier',          'reference', 'zero_or_one', NULL::text,                                false, true,  '{"ref_entity":"supplier"}'::jsonb,        50),
    ('payment_method_id', 'payment_method_id','Payment Method',    'reference', 'one',         NULL::text,                                true,  true,  '{"ref_entity":"payment_method"}'::jsonb, 55),
    ('document_date',     'document_date',    'Payment Date',      'date',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               60),
    ('posting_date',      'posting_date',     'Posting Date',      'date',      'one',         NULL::text,                                true,  true,  NULL::jsonb,                               70),
    ('value_date',        'value_date',       'Value Date',        'date',      'one',         NULL::text,                                true,  false, NULL::jsonb,                               80),
    ('currency_code',     'currency_code',    'Currency',          'text',      'one',         NULL::text,                                true,  true,  '{"max_length":3}'::jsonb,                 90),
    ('payment_amount',    'payment_amount',   'Payment Amount',    'decimal',   'one',         NULL::text,                                true,  false, '{"min":0}'::jsonb,                       100),
    ('payment_reference', 'payment_reference','Payment Reference', 'text',      'zero_or_one', NULL::text,                                false, false, '{"max_length":200}'::jsonb,              110),
    ('notes',             'notes',            'Notes',             'text',      'zero_or_one', NULL::text,                                false, false, '{"max_length":1000}'::jsonb,             120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;



-- Ã¢â€â‚¬Ã¢â€â‚¬ 7. Fix ref_entity: "supplier" on already-seeded rows (was "vendor") Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET validation = '{"ref_entity":"supplier"}'::jsonb
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'supplier_id'
  AND ef.validation->>'ref_entity' = 'vendor';


-- â”€â”€ 8. Batch 6A.2 â€” payment_entry coverage expansion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- (a) payment_direction stays as text (DDL default 'OUTBOUND' + CHECK is
--     uppercase). Deferred to a follow-up batch that renames the value across
--     services / blueprints / tenant seeds; lookup_value.code is constrained
--     to lowercase snake_case so a lookup binding is not viable today.
--
-- (b) Register bank_account_id, supplier_bank_link_id, payment_method_id
--     reference metadata (fk fields default to pg_catalog auto-loop shape;
--     this promotes them to interactive picker surfaces).
UPDATE control.entity_field ef
SET ui_type     = 'reference',
    validation  = f.validation,
    group_key   = 'banking',
    updated_at  = now()
FROM (VALUES
    ('bank_account_id',        '{"ref_entity":"bank_account"}'::jsonb),
    ('supplier_bank_link_id',  '{"ref_entity":"bank_account_link"}'::jsonb)
) AS f(name, validation),
control.entity_version ev,
control.entity e
WHERE ef.entity_version_id = ev.id
  AND ev.entity_id          = e.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = f.name;

-- (c) Hide server-managed state flags, transmission tracking, void / reversal
--     bookkeeping, cleared date, JE / bank-statement links, and fiscal
--     derivation. These are set by the payment posting service, batch runner,
--     bank reconciliation worker, or lifecycle triggers â€” never by the UI.
UPDATE control.entity_field ef
SET is_required = false,
    editability = jsonb_build_object('editableOnCreate', false, 'editableOnEdit', false),
    updated_at  = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
      'supplier_name', 'base_amount', 'payment_currency_amount',
      'payment_je_id', 'payment_run_id',
      'is_posted', 'is_reversal', 'reversal_of_id', 'reversal_reason',
      'is_batch_payment', 'is_printed', 'is_transmitted', 'transmission_status',
      'is_voided', 'voided_at', 'voided_by', 'void_reason',
      'cleared_date',
      'bank_statement_line_id',
      'fiscal_year', 'period_number'
  );

-- (d) bank_reference and check_number are user-authored optional identifiers
--     surfaced in the banking group.
UPDATE control.entity_field ef
SET is_read_only = false, ui_type = NULL, group_key = 'banking', updated_at = now()
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'payment_entry'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('bank_reference', 'check_number');




-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field (27 fields) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Group A: Identity & Parent          (5-10)
-- Group B: Item classification        (20-45)
-- Group C: Quantity & Pricing         (50-82)
-- Group D: Tax & Gross                (90-100)
-- Group E: Dimensions                 (110-125)
-- Group F: Matching & Asset           (130-145)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- Ã¢â€â‚¬Ã¢â€â‚¬ A: Identity & Parent Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('purchase_invoice_id', 'purchase_invoice_id', 'Invoice',             'reference', 'one',         NULL::text,                                 true,  false, '{"ref_entity":"purchase_invoice"}'::jsonb,    5),
    ('line_no',             'line_no',             'Line No.',            'integer',   'one',         NULL::text,                                 true,  false, '{"min":1}'::jsonb,                           10),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ B: Item Classification Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
     ('item_description',    'item_description',    'Description',         'text',      'one',         NULL::text,                                 true,  false, '{"max_length":500}'::jsonb,                  20),
     ('procurement_type',    'procurement_type',    'Type',                'enum',      'one',         'document.procurement_type'::text,          true,  true,  NULL::jsonb,                                  30),
     ('line_type',           'line_type',           'Line Type',           'enum',      'one',         'document.line_type'::text,                 false, true,  NULL::jsonb,                                  31),
     ('item_id',             'item_id',             'Item',                'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"item"}'::jsonb,               35),
    ('commodity_category_id',   'commodity_category_id',   'Commodity Category',      'reference', 'zero_or_one', NULL::text,                                 false, true,  '{"ref_entity":"commodity_category"}'::jsonb,     40),
    ('business_intent_id',  'business_intent_id',  'Business Intent',     'reference', 'zero_or_one', NULL::text,                                 false, false, '{"ref_entity":"business_intent"}'::jsonb,    45),
    -- unspsc_code / hs_code aliases removed â€” PIL has no metadata jsonb column
    -- (see 01e_tables_invoice.sql:243-244 for the reset). Reintroduce once a
    -- storage target lands (either a metadata jsonb on PIL or dedicated cols).
    -- Ã¢â€â‚¬Ã¢â€â‚¬ C: Quantity & Pricing Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('uom_code',            'uom_code',            'UoM',                 'text',      'one',         NULL::text,                                 true,  false, '{"max_length":20}'::jsonb,                   50),
    ('quantity',            'quantity',            'Quantity',            'decimal',   'one',         NULL::text,                                 true,  false, '{"nonzero":true}'::jsonb,                    60),
    ('unit_price',          'unit_price',          'Unit Price',          'decimal',   'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,                           70),
    ('price_unit',          'price_unit',          'Price Per',           'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           72),
    ('net_amount',          'net_amount',          'Net Amount',          'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           80),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ D: Tax & Gross (discount + retention columns removed per Phase 1 reset) Ã¢â€â‚¬Ã¢â€â‚¬
    ('tax_amount',          'tax_amount',          'Tax Amount',          'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           90),
    ('withholding_tax_amount','withholding_tax_amount','WHT Amount',       'decimal',   'one',         NULL::text,                                 false, false, '{"min":0}'::jsonb,                           95),
    ('gross_amount',        'gross_amount',        'Gross Amount',        'decimal',   'one',         NULL::text,                                 true,  false, '{"min":0}'::jsonb,                          100),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ E: Logistical (site stays; accounting dimensions live on AD) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('site_id',             'site_id',             'Site',                'reference', 'zero_or_one', NULL::text,                                 false, true,  '{"ref_entity":"site"}'::jsonb,              125),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ F: Matching & Asset Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('match_status',        'match_status',        'Match Status',        'enum',      'one',         'document.invoice_match_status'::text,      false, true,  NULL::jsonb,                                 130),
    ('matched_quantity',    'matched_quantity',    'Matched Qty',         'decimal',   'zero_or_one', NULL::text,                                 false, false, '{"min":0}'::jsonb,                          135),
    ('asset_class_id',      'asset_class_id',      'Asset Class',         'reference', 'zero_or_one', NULL::text,                                 false, true,  '{"ref_entity":"asset_class"}'::jsonb,       140),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ G: Shipping override (line may override header default) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    -- shipto_address picker: scoped to the line's site_id (which defaults
    -- to header.site_id when null) via v_site_address.
    -- Picker filter + dependent_filter set via reference_config/lookup_config
    -- UPDATE below the INSERT (the compiler does not lift them from validation).
    ('shipto_address_id',         'shipto_address_id',         'Ship-To Address',
        'reference', 'zero_or_one', NULL::text, false, false,
        '{"ref_entity":"v_site_address"}'::jsonb,
        150),
    -- shipfrom_address picker: scoped to the parent PI's supplier_id via
    -- v_supplier_address (handles both supplier and BP-anchored links).
    ('shipfrom_address_id',       'shipfrom_address_id',       'Ship-From Address',
        'reference', 'zero_or_one', NULL::text, false, false,
        '{"ref_entity":"v_supplier_address"}'::jsonb,
        152),
    -- Jurisdiction snapshots are derived by trg_pil_derive_ship_jurisdictions;
    -- registered for visibility on the Shipping panel as read-only chips.
    ('to_tax_jurisdiction_id','to_tax_jurisdiction_id','Ship-To Jurisdiction',
        'reference', 'zero_or_one', NULL::text, false, false,
        '{"ref_entity":"tax_jurisdiction","display_field":"name","editable_in_status":[]}'::jsonb,
        154),
    ('from_tax_jurisdiction_id','from_tax_jurisdiction_id','Ship-From Jurisdiction',
        'reference', 'zero_or_one', NULL::text, false, false,
        '{"ref_entity":"tax_jurisdiction","display_field":"name","editable_in_status":[]}'::jsonb,
        156)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- â”€â”€â”€ Line ship-side address pickers: filter + dependent_filter wiring â”€â”€â”€â”€â”€â”€â”€
-- Same fix as the header bill-side block above â€” compiler reads picker filters
-- and dependent_filter from reference_config/lookup_config, not validation.
-- empty_behavior='all' (was 'none') so the picker degrades gracefully when the
-- dependency isn't threaded as context (site_id from PIL, supplier_id from PI).
-- The line-level defaulter trigger (document.resolve_pil_defaults) pre-fills
-- the value from source-line cascade / primary-link lookup, so the picker
-- exists mostly for user overrides â€” it should still open and show options.
UPDATE control.entity_field ef
   SET reference_config = '{"display_field":"name","label_field":"name","code_field":"code","description_field":"formatted_address","value_field":"address_id"}'::jsonb,
       lookup_config    = '{"filters":{"purpose":"ship_to,default"},"dependent_filter":{"source_field":"site_id","target_field":"site_id","empty_behavior":"all"}}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'shipto_address_id';

UPDATE control.entity_field ef
   SET reference_config = '{"display_field":"name","label_field":"name","code_field":"code","description_field":"formatted_address","value_field":"address_id"}'::jsonb,
       lookup_config    = '{"filters":{"purpose":"ship_from,default"},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"all"}}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'shipfrom_address_id';

-- site_id picker: dependent_filter on company_code_id (from PI header).
-- empty_behavior='all' so the picker still works even when context isn't
-- threaded â€” the user just sees all active sites for the tenant.
UPDATE control.entity_field ef
   SET reference_config = '{"target_entity":"site","display_field":"name","label_field":"name","code_field":"code","value_field":"id"}'::jsonb,
       lookup_config    = '{"filters":{"status":"active"},"dependent_filter":{"source_field":"company_code_id","target_field":"company_code_id","empty_behavior":"all"}}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'site_id';


-- Folded in from retired runtime repair: canonical field metadata for line rows.
WITH line_fields(
    name, column_name, label, data_type, cardinality, enum_domain_code,
    reference_config, validation, is_required, is_filterable, is_read_only,
    sort_order, group_key
) AS (
    VALUES
    ('purchase_invoice_id', 'purchase_invoice_id', 'Invoice', 'reference', 'one', NULL::text, '{"target_entity":"purchase_invoice","display_field":"code"}'::jsonb, '{"ref_entity":"purchase_invoice"}'::jsonb, true, false, true, 5, NULL::text),
    ('line_no', 'line_no', 'Line No.', 'integer', 'one', NULL::text, NULL::jsonb, '{"min":1}'::jsonb, true, false, true, 10, NULL::text),
     ('item_description', 'item_description', 'Description', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":500}'::jsonb, true, false, false, 20, 'item'),
     ('procurement_type', 'procurement_type', 'Type', 'enum', 'one', 'document.procurement_type', NULL::jsonb, NULL::jsonb, true, true, false, 30, 'item'),
     ('line_type', 'line_type', 'Line Type', 'enum', 'one', 'document.line_type', NULL::jsonb, NULL::jsonb, false, true, false, 31, 'item'),
     ('item_id', 'item_id', 'Item', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"item"}'::jsonb, '{"ref_entity":"item"}'::jsonb, false, false, false, 35, 'item'),
    ('commodity_category_id', 'commodity_category_id', 'Commodity Category', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"commodity_category"}'::jsonb, '{"ref_entity":"commodity_category"}'::jsonb, false, true, false, 40, 'classification'),
    ('business_intent_id', 'business_intent_id', 'Business Intent', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"business_intent"}'::jsonb, '{"ref_entity":"business_intent"}'::jsonb, false, false, false, 45, 'classification'),
    ('unspsc_code', 'metadata', 'UNSPSC Code', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":32}'::jsonb, false, false, false, 46, 'classification'),
    ('hs_code', 'metadata', 'HS / Trade Code', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":32}'::jsonb, false, false, false, 47, 'classification'),
    ('uom_code', 'uom_code', 'UoM', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":20}'::jsonb, true, false, false, 50, 'item'),
    ('quantity', 'quantity', 'Quantity', 'decimal', 'one', NULL::text, NULL::jsonb, '{"nonzero":true}'::jsonb, true, false, false, 60, 'item'),
    ('unit_price', 'unit_price', 'Unit Price', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, false, false, 70, 'item'),
    ('price_unit', 'price_unit', 'Price Per', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 72, 'item'),
    ('discount_pct', 'discount_pct', 'Discount %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, false, false, false, 75, 'discount'),
    ('net_amount', 'net_amount', 'Net Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 80, 'financial'),
    ('discount_amount', 'discount_amount', 'Discount Amount', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 82, 'discount'),
    ('tax_amount', 'tax_amount', 'Tax Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 90, 'tax'),
    ('withholding_tax_amount', 'withholding_tax_amount', 'WHT Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 95, 'tax'),
    ('gross_amount', 'gross_amount', 'Gross Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, false, false, 100, 'financial'),
    ('retention_pct', 'retention_pct', 'Retention %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, false, false, false, 102, 'retention'),
    ('retention_amount', 'retention_amount', 'Retention Amt', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 104, 'retention'),
    -- Accounting dimensions (cost_center, profit_center, project) live on AD;
    -- site stays on the line because it drives ship_to / jurisdiction cascade.
    ('site_id', 'site_id', 'Site', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"site"}'::jsonb, '{"ref_entity":"site"}'::jsonb, false, false, false, 125, 'logistics'),
    ('match_status', 'match_status', 'Match Status', 'enum', 'one', 'document.invoice_match_status', NULL::jsonb, NULL::jsonb, false, true, true, 130, 'matching'),
    ('matched_quantity', 'matched_quantity', 'Matched Qty', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 135, 'matching'),
    ('asset_class_id', 'asset_class_id', 'Asset Class', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"asset_class"}'::jsonb, '{"ref_entity":"asset_class"}'::jsonb, false, true, false, 140, 'matching'),
    ('commitment_line_id', 'commitment_line_id', 'PO Line', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"commitment_line"}'::jsonb, '{"ref_entity":"commitment_line"}'::jsonb, false, false, true, 150, 'matching'),
    ('receipt_line_id', 'receipt_line_id', 'Receipt Line', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"receipt_line"}'::jsonb, '{"ref_entity":"receipt_line"}'::jsonb, false, false, true, 151, 'matching'),
    ('service_sheet_line_id', 'service_sheet_line_id', 'Service Sheet Line', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"service_sheet_line"}'::jsonb, '{"ref_entity":"service_sheet_line"}'::jsonb, false, false, true, 152, 'matching')
)
UPDATE control.entity_field ef
  SET column_name = lf.column_name,
       label = lf.label,
       data_type = lf.data_type,
       ui_type = NULL,
       cardinality = lf.cardinality,
       origin = 'standard',
       enum_config = NULL,
       enum_domain_code = lf.enum_domain_code,
       reference_config = lf.reference_config,
       validation = lf.validation,
       is_required = lf.is_required,
       is_filterable = lf.is_filterable,
       is_read_only = CASE
           WHEN lf.name IN ('tax_amount', 'withholding_tax_amount') THEN true
           ELSE lf.is_read_only
       END,
       is_computed = CASE
           WHEN lf.name = 'net_amount' THEN true
           -- tax_amount, withholding_tax_amount: roll up from line-level pricing_component rows.
           -- Flat columns retained for read-only legacy compatibility (WS-COMPAT backfill).
           WHEN lf.name IN ('tax_amount', 'withholding_tax_amount') THEN true
           ELSE false
       END,
       -- net_amount on purchase_invoice_line is DDL-GENERATED ALWAYS AS STORED.
       -- tax_amount, withholding_tax_amount are PC-derived (compute_mode='pricing_components').
       -- compute_mode must be set when is_computed=true (ef_computed_chk).
       compute_mode = CASE
           WHEN lf.name = 'net_amount' THEN 'generated'
           WHEN lf.name IN ('tax_amount', 'withholding_tax_amount') THEN 'pricing_components'
           ELSE ef.compute_mode
       END,
       is_active = true,
       ui_hint = CASE
           WHEN lf.group_key IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb) - 'group_key'
           ELSE COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', lf.group_key)
       END,
       sort_order = lf.sort_order,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM line_fields lf,
       control.entity_version ev,
       control.entity e
 WHERE e.entity_code = 'purchase_invoice_line'
   AND e.tenant_id IS NULL
   AND e.id = ev.entity_id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
   AND ev.id = ef.entity_version_id
   AND ef.tenant_id IS NULL
   AND ef.name = lf.name;


-- Field-level line grid hints: column order/labels remain owned by the line entity.
WITH field_grid AS (
  SELECT *
  FROM (VALUES
    ('line_no',          '#'::text,            'line_number',      10,  '42px',              true),
    ('item_id',          'Item',               'item_code',        20,  '86px',              false),
    ('item_description', 'Description',        'description',      30,  'minmax(18rem,1fr)', true),
    ('quantity',         'Qty',                'quantity',         40,  '104px',             true),
    ('uom_code',         'UoM',                'unit_code',        50,  '54px',              false),
    ('unit_price',       'Unit',               'unit_price',       60,  '84px',              true),
    ('net_amount',       'Net Amount',         'net_amount',       70,  '112px',             true),
    ('discount_amount',  'Discount Amount',    'discount_amount',  80,  '132px',             true),
    ('tax_amount',       'Tax Amount',         'tax_amount',       90,  '112px',             true),
    ('gross_amount',     'Gross Amount',       'gross_amount',     100, '120px',             true)
  ) AS v(field_name, label, runtime_path, order_no, width_hint, is_default_visible)
)
UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object(
      'line_grid',
      jsonb_build_object(
        'visible', fg.is_default_visible,
        'label', fg.label,
        'path', fg.runtime_path,
        'order', fg.order_no,
        'width', fg.width_hint
      )
    ),
    label = CASE WHEN ef.name = 'discount_amount' AND ef.label = 'Discount Amt' THEN 'Discount Amount' ELSE ef.label END,
    is_sortable = CASE WHEN ef.name IN ('line_no','item_description','quantity','unit_price','net_amount','discount_amount','tax_amount','gross_amount') THEN true ELSE ef.is_sortable END,
    is_aggregatable = CASE WHEN ef.name IN ('net_amount','discount_amount','tax_amount','gross_amount') THEN true ELSE ef.is_aggregatable END,
    is_groupable = CASE WHEN ef.name IN ('procurement_type','line_type','match_status','asset_class_id') THEN true ELSE ef.is_groupable END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
JOIN field_grid fg ON true
WHERE ef.entity_version_id = ev.id
  AND fg.field_name = ef.name
  AND e.table_schema = 'document'
  AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;


-- Ã¢â€â‚¬Ã¢â€â‚¬ 7. Field group registry Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

-- Ã¢â€â‚¬Ã¢â€â‚¬ 8. Group-key patches on existing 27 fields Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Merges group_key into ui_hint without touching line_grid hints set in Ã‚Â§4.
UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
              || jsonb_build_object('group_key',
                   CASE ef.name
                     WHEN 'item_description'       THEN 'item'
                      WHEN 'procurement_type'        THEN 'item'
                      WHEN 'line_type'               THEN 'item'
                     WHEN 'item_id'                 THEN 'item'
                     WHEN 'uom_code'                THEN 'item'
                     WHEN 'quantity'                THEN 'item'
                     WHEN 'unit_price'              THEN 'item'
                     WHEN 'price_unit'              THEN 'item'
                     WHEN 'net_amount'              THEN 'financial'
                     WHEN 'gross_amount'            THEN 'financial'
                     WHEN 'commodity_category_id'       THEN 'classification'
                     WHEN 'business_intent_id'      THEN 'classification'
                     WHEN 'unspsc_code'             THEN 'classification'
                     WHEN 'hs_code'                 THEN 'classification'
                     WHEN 'tax_amount'              THEN 'tax'
                     WHEN 'withholding_tax_amount'  THEN 'tax'
                     WHEN 'discount_pct'            THEN 'discount'
                     WHEN 'discount_amount'         THEN 'discount'
                     WHEN 'retention_pct'           THEN 'retention'
                     WHEN 'retention_amount'        THEN 'retention'
                     WHEN 'site_id'                 THEN 'logistics'
                     WHEN 'match_status'            THEN 'matching'
                     WHEN 'matched_quantity'        THEN 'matching'
                     WHEN 'asset_class_id'          THEN 'matching'
                   END
                 )
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
    'item_description', 'procurement_type', 'line_type', 'item_id', 'uom_code',
    'quantity', 'unit_price', 'price_unit',
    'net_amount', 'gross_amount',
    'commodity_category_id', 'business_intent_id', 'unspsc_code', 'hs_code',
    'tax_amount', 'withholding_tax_amount',
    'discount_pct', 'discount_amount',
    'retention_pct', 'retention_amount',
    'site_id',
    'match_status', 'matched_quantity', 'asset_class_id'
  );


-- Ã¢â€â‚¬Ã¢â€â‚¬ 9. FK reference link fields (matching group) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
              || jsonb_build_object('taxonomy_domain',
                   CASE ef.name
                     WHEN 'unspsc_code' THEN 'unspsc'
                     WHEN 'hs_code'     THEN 'hs'
                   END
                 )
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('unspsc_code', 'hs_code');


-- Three read-only reference fields surfaced in the Reference tab.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, is_required, is_filterable,
    reference_config, validation, ui_hint, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, 'reference',
       'zero_or_one', 'standard', false, false,
       f.reference_config, f.validation, f.ui_hint, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('commitment_line_id',
     'commitment_line_id',
     'PO Line',
     '{"target_entity":"commitment_line","target_field":"id","display_field":"line_no"}'::jsonb,
     '{"ref_entity":"commitment_line"}'::jsonb,
     '{"group_key":"matching","read_only":true}'::jsonb,
     150),
    ('receipt_line_id',
     'receipt_line_id',
     'Receipt Line',
     '{"target_entity":"receipt_line","target_field":"id","display_field":"line_no"}'::jsonb,
     '{"ref_entity":"receipt_line"}'::jsonb,
     '{"group_key":"matching","read_only":true}'::jsonb,
     155),
    ('service_sheet_line_id',
     'service_sheet_line_id',
     'Service Sheet Line',
     '{"target_entity":"service_sheet_line","target_field":"id","display_field":"line_no"}'::jsonb,
     '{"ref_entity":"service_sheet_line"}'::jsonb,
     '{"group_key":"matching","read_only":true}'::jsonb,
     160)
) AS f(name, column_name, label, reference_config, validation, ui_hint, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice_line'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    reference_config = EXCLUDED.reference_config,
    validation = EXCLUDED.validation,
    ui_hint = EXCLUDED.ui_hint,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- Ã¢â€â‚¬Ã¢â€â‚¬ 2. control.entity_version Ã¢â‚¬â€ extracted to 006_domain_entities.sql Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

-- Ã¢â€â‚¬Ã¢â€â‚¬ 3. control.entity_field (19 fields) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
-- Group A: Source document (polymorphic)   (5-10)
-- Group B: Split basis & amounts           (20-35)
-- Group C: Account resolution inputs       (40-52)
-- Group D: Dimensions                      (70-80)  cost/profit/project only;
--                                                    site, intent, commodity live on the P2P line.
-- Group E: Flags, budget & narrative       (90-110)
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- Ã¢â€â‚¬Ã¢â€â‚¬ A: Source Document Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('source_doc_type',     'source_doc_type',     'Source Document Type','text',      'one',         NULL::text,                                   true,  true,  NULL::jsonb,                                    5),
    ('source_line_id',      'source_line_id',      'Commercial Line',     'reference', 'one',         NULL::text,                                   true,  false, '{"polymorphic":true}'::jsonb,                  7),
    ('distribution_no',     'distribution_no',     'Split No.',           'integer',   'one',         NULL::text,                                   true,  false, '{"min":1}'::jsonb,                            10),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ B: Split Basis & Amounts Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('distribution_basis',  'distribution_basis',  'Split Basis',         'enum',      'one',         'document.acct_dist_distribution_basis'::text, true,  true,  NULL::jsonb,                                   20),
    ('split_pct',           'split_pct',           'Split %',             'decimal',   'zero_or_one', NULL::text,                                    false, false, '{"min":0}'::jsonb,                            25),
    ('split_amount',        'split_amount',        'Split Amount',        'decimal',   'zero_or_one', NULL::text,                                    false, false, '{"min":0}'::jsonb,                            27),
    ('distributed_amount',  'distributed_amount',  'Assigned Amount',     'decimal',   'one',         NULL::text,                                    true,  true,  '{"min":0}'::jsonb,                            30),
    ('currency_code',       'currency_code',       'Currency',            'text',      'one',         NULL::text,                                    true,  false, '{"max_length":3}'::jsonb,                     35),
    -- Ã¢â€â‚¬Ã¢â€â‚¬ C: Account Resolution Provenance Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('account_source',      'account_source',      'Account Source',      'enum',      'one',         'document.acct_dist_account_source'::text,     true,  true,  NULL::jsonb,                                   40),
    ('gl_account_id',       'gl_account_id',       'Resolved GL Account', 'reference', 'zero_or_one', NULL::text,                                    false, true,  '{"ref_entity":"gl_account"}'::jsonb,          50),
    -- business_intent_id and commodity_category_id intentionally omitted Ã¢â‚¬â€
    -- sourced from the P2P line, not duplicated on accounting_distribution.
    -- Ã¢â€â‚¬Ã¢â€â‚¬ D: Dimensions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('cost_center_id',      'cost_center_id',      'Cost Centre',         'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"cost_center"}'::jsonb,         70),
    ('profit_center_id',    'profit_center_id',    'Profit Centre',       'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"profit_center"}'::jsonb,       75),
    ('project_id',          'project_id',          'Project',             'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"project"}'::jsonb,             80),
    -- site_id intentionally omitted Ã¢â‚¬â€ sourced from the P2P line.
    -- Ã¢â€â‚¬Ã¢â€â‚¬ E: Asset, Budget & Narrative Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    ('asset_id',            'asset_id',            'Asset',               'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"asset"}'::jsonb,                90),
    -- Budget allocation: line-grain override of header default; cascade default
    -- from PI header set in 042d_ap_purchase_invoice_contract.sql.
    ('budget_allocation_id','budget_allocation_id','Budget Allocation',   'reference', 'zero_or_one', NULL::text,                                   false, true,  '{"ref_entity":"budget_allocation"}'::jsonb,    95),
    -- Derived hash of the four scalar dimensions; system-maintained.
    ('dimension_set_id',    'dimension_set_id',    'Dimension Set',       'reference', 'zero_or_one', NULL::text,                                   false, false, '{"ref_entity":"dimension_set","editable_in_status":[]}'::jsonb, 98),
    ('budget_check_result', 'budget_check_result', 'Budget Check',        'text',      'zero_or_one', NULL::text,                                   false, true,  NULL::jsonb,                                  100),
    ('description',         'description',         'Split Text',          'text',      'zero_or_one', NULL::text,                                   false, false, '{"max_length":500}'::jsonb,                  110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'document' AND e.table_name = 'accounting_distribution'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    validation = EXCLUDED.validation,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- Folded in from retired runtime repair: canonical field metadata for splits.
WITH distribution_fields(
    name, column_name, label, data_type, cardinality, enum_domain_code,
    reference_config, validation, is_required, is_filterable, is_read_only,
    sort_order, group_key
) AS (
    VALUES
    ('source_doc_type', 'source_doc_type', 'Source Document Type', 'text', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, true, 5, 'reference'),
    ('source_line_id', 'source_line_id', 'Commercial Line', 'reference', 'one', NULL::text, NULL::jsonb, '{"polymorphic":true}'::jsonb, true, false, true, 7, 'reference'),
    ('distribution_no', 'distribution_no', 'Split No.', 'integer', 'one', NULL::text, NULL::jsonb, '{"min":1}'::jsonb, true, false, true, 10, 'identity'),
    ('distribution_basis', 'distribution_basis', 'Split Basis', 'enum', 'one', 'document.acct_dist_distribution_basis', NULL::jsonb, NULL::jsonb, true, true, false, 20, 'financial'),
    ('split_pct', 'split_pct', 'Split %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 25, 'financial'),
    ('split_amount', 'split_amount', 'Split Amount', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 27, 'financial'),
    ('distributed_amount', 'distributed_amount', 'Assigned Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, true, false, 30, 'financial'),
    ('currency_code', 'currency_code', 'Currency', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":3}'::jsonb, true, false, true, 35, 'financial'),
    ('account_source', 'account_source', 'Account Source', 'enum', 'one', 'document.acct_dist_account_source', NULL::jsonb, NULL::jsonb, true, true, true, 40, 'matching'),
    ('gl_account_id', 'gl_account_id', 'Resolved GL Account', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, '{"ref_entity":"gl_account"}'::jsonb, false, true, true, 50, 'matching'),
    -- business_intent_id and commodity_category_id intentionally omitted Ã¢â‚¬â€ sourced from P2P line.
    ('cost_center_id', 'cost_center_id', 'Cost Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"cost_center","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"cost_center"}'::jsonb, false, true, false, 70, 'dimensions'),
    ('profit_center_id', 'profit_center_id', 'Profit Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"profit_center","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"profit_center"}'::jsonb, false, false, false, 75, 'dimensions'),
    ('project_id', 'project_id', 'Project', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"project","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"project"}'::jsonb, false, true, false, 80, 'dimensions'),
    -- site_id intentionally omitted Ã¢â‚¬â€ sourced from P2P line.
    ('asset_id', 'asset_id', 'Asset', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"asset","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"asset"}'::jsonb, false, true, false, 90, 'matching'),
    ('budget_check_result', 'budget_check_result', 'Budget Check', 'text', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, true, 100, 'matching'),
    ('description', 'description', 'Split Text', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":500}'::jsonb, false, false, false, 110, 'identity')
)
-- Update canonical accounting distribution field metadata.
UPDATE control.entity_field ef
   SET column_name = df.column_name,
       label = df.label,
       data_type = df.data_type,
       ui_type = NULL,
       cardinality = df.cardinality,
       origin = 'standard',
       enum_config = NULL,
       enum_domain_code = df.enum_domain_code,
       reference_config = df.reference_config,
       validation = df.validation,
       is_required = df.is_required,
       is_filterable = df.is_filterable,
       is_read_only = df.is_read_only,
       is_computed = false,
       is_active = true,
       ui_hint = CASE
           WHEN df.group_key IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb) - 'group_key'
           ELSE COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', df.group_key)
       END,
       sort_order = df.sort_order,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM distribution_fields df,
       control.entity_version ev,
       control.entity e
 WHERE e.entity_code = 'accounting_distribution'
   AND e.tenant_id IS NULL
   AND e.id = ev.entity_id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
   AND ev.id = ef.entity_version_id
   AND ef.tenant_id IS NULL
   AND ef.name = df.name;


-- GL account picker lookup_config: company code -> primary operating COA -> postable GL accounts.
UPDATE control.entity_field ef
   SET lookup_config = '{
         "search_fields": ["code", "name"],
         "filters": {
           "status": "active",
           "posting_allowed": true
         },
         "dependent_filter": {
           "source_field": "company_code_id",
           "target_field": "chart_of_account_id",
           "through_entity": "company_code_chart_assignment",
           "through_source_field": "company_code_id",
           "through_target_field": "chart_of_account_id",
           "through_filters": {
             "status": "active",
             "assignment_type": "operating",
             "is_primary": true
           },
           "empty_behavior": "none"
         }
       }'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
 WHERE e.entity_code = 'accounting_distribution'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
   AND ef.entity_version_id = ev.id
   AND ef.tenant_id IS NULL
   AND ef.name = 'gl_account_id'
   AND COALESCE(ef.lookup_config, '{}'::jsonb) IS DISTINCT FROM '{
         "search_fields": ["code", "name"],
         "filters": {
           "status": "active",
           "posting_allowed": true
         },
         "dependent_filter": {
           "source_field": "company_code_id",
           "target_field": "chart_of_account_id",
           "through_entity": "company_code_chart_assignment",
           "through_source_field": "company_code_id",
           "through_target_field": "chart_of_account_id",
           "through_filters": {
             "status": "active",
             "assignment_type": "operating",
             "is_primary": true
           },
           "empty_behavior": "none"
         }
       }'::jsonb;




-- ---------------------------------------------------------------------------
-- Ã‚Â§C0  Remove stale old-name rows that may have been re-inserted by a
--      re-run of 001_invoice.sql before the field-name fix landed.
--      Safe no-op on a clean DB: these names never exist there.
-- ---------------------------------------------------------------------------
UPDATE control.entity_field ef
   SET runtime_enabled = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
  AND ef.name       IN ('gross_amount', 'vendor_invoice_ref')
  AND ef.tenant_id  IS NULL;


-- ---------------------------------------------------------------------------
-- Ã‚Â§F1  Rename gross_amount Ã¢â€ â€™ total_amount
-- ---------------------------------------------------------------------------

UPDATE control.entity_field ef
   SET name        = 'total_amount',
       column_name = 'total_amount'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name        = 'gross_amount'
   AND ef.tenant_id  IS NULL;


-- ---------------------------------------------------------------------------
-- Ã‚Â§F2  Rename supplier_invoice_number (was vendor_invoice_ref)
-- ---------------------------------------------------------------------------

UPDATE control.entity_field ef
   SET name        = 'supplier_invoice_number',
       column_name = 'supplier_invoice_number'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id   IS NULL
   AND ev.version_no  = 1
   AND ef.name        = 'vendor_invoice_ref'
   AND ef.tenant_id  IS NULL;


-- ---------------------------------------------------------------------------
-- Ã‚Â§F3  Upsert tax_mode field
-- ---------------------------------------------------------------------------

INSERT INTO control.entity_field (
    tenant_id, entity_version_id, name, column_name, data_type, origin,
    label, description, enum_domain_code,
    is_required, is_filterable, is_searchable, is_sortable,
    sort_order, created_by)
SELECT
    NULL,
    ev.id,
    'tax_mode',
    'tax_mode',
    'lookup',
    'standard',
    'Tax Mode',
    'How tax_amount relates to Invoice Total: inclusive (tax within total), exclusive (tax added on top), or no_tax (exempt).',
    'document.purchase_invoice_tax_mode',
    false, true, true, false,
    85,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    data_type = EXCLUDED.data_type,
    origin = EXCLUDED.origin,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    is_sortable = EXCLUDED.is_sortable,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- ---------------------------------------------------------------------------
-- Ã‚Â§F4  Upsert tax_mode_source field
-- ---------------------------------------------------------------------------

INSERT INTO control.entity_field (
    tenant_id, entity_version_id, name, column_name, data_type, origin,
    label, description, enum_domain_code,
    is_required, is_filterable, is_searchable, is_sortable,
    sort_order, created_by)
SELECT
    NULL,
    ev.id,
    'tax_mode_source',
    'tax_mode_source',
    'lookup',
    'standard',
    'Tax Mode Source',
    'How tax_mode was determined Ã¢â‚¬â€ for audit trail and UI attribution.',
    'document.purchase_invoice_tax_mode_source',
    false, true, false, false,
    86,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice'
  AND e.tenant_id   IS NULL
  AND ev.version_no  = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    data_type = EXCLUDED.data_type,
    origin = EXCLUDED.origin,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    is_sortable = EXCLUDED.is_sortable,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;


-- 001b_invoice_name_field_patch.sql
-- Renames the description field label from "Description" Ã¢â€ â€™ "Invoice Name"
-- and tightens max_length from 500 Ã¢â€ â€™ 200 for the purchase_invoice entity.

UPDATE control.entity_field ef
   SET label      = 'Invoice Name',
       constraints = '{"max_length":200}'::jsonb
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.name               = 'description'
   AND e.table_schema        = 'document'
   AND e.table_name          = 'purchase_invoice'
   AND e.tenant_id           IS NULL;




-- 300_control/002_commodity_category_policy_apps.sql
-- Purpose: expose commodity category policy tables through the generic entity app runtime.
-- Idempotent: upserts entity rows, version 1, fields, display config, lifecycle, and operations.

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc uuid;
BEGIN
    SELECT id INTO v_acc FROM shared.module WHERE code = 'ACC';


    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, 'standard', f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.validation, f.reference_config, f.sort_order, v_su
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    CROSS JOIN (VALUES
        ('commodity_category_buy_policy','commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one',true,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,'{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,110),
        ('commodity_category_buy_policy','business_intent_id','business_intent_id','Business Intent','uuid','reference','one',true,true,false,false,'{"ref_entity":"business_intent"}'::jsonb,'{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,120),
        ('commodity_category_buy_policy','company_code_id','company_code_id','Company Code','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,130),
        ('commodity_category_buy_policy','scope_type','scope_type','Scope Type','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,140),
        ('commodity_category_buy_policy','scope_id','scope_id','Scope','uuid','reference','zero_or_one',false,true,false,false,NULL::jsonb,NULL::jsonb,150),
        ('commodity_category_buy_policy','mapping_mode','mapping_mode','Mode','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,160),
        ('commodity_category_buy_policy','is_default','is_default','Default','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,170),
        ('commodity_category_buy_policy','is_selectable','is_selectable','Selectable','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,180),
        ('commodity_category_buy_policy','default_gl_account_id','default_gl_account_id','Default GL Account','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,190),
        ('commodity_category_buy_policy','default_tax_group_id','default_tax_group_id','Default Tax Group','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"tax_group"}'::jsonb,'{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,200),
        ('commodity_category_buy_policy','default_asset_class_id','default_asset_class_id','Default Asset Class','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"asset_class"}'::jsonb,'{"target_entity":"asset_class","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,210),
        ('commodity_category_buy_policy','default_asset_profile_code','default_asset_profile_code','Asset Profile','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,220),
        ('commodity_category_buy_policy','default_budget_profile_id','default_budget_profile_id','Default Budget Profile','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"budget_profile"}'::jsonb,'{"target_entity":"budget_profile","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,230),
        ('commodity_category_buy_policy','is_asset_tag_required','is_asset_tag_required','Asset Tag Required','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,240),
        ('commodity_category_buy_policy','capex_screening_threshold','capex_screening_threshold','Capex Threshold','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,250),
        ('commodity_category_buy_policy','capex_screening_currency','capex_screening_currency','Capex Currency','string','currency','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,260),
        ('commodity_category_buy_policy','override_visibility','override_visibility','Override Visibility','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,270),
        ('commodity_category_buy_policy','override_is_classification_required','override_is_classification_required','Override Classification Required','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,280),
        ('commodity_category_buy_policy','override_is_hs_required','override_is_hs_required','Override HS Required','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,290),
        ('commodity_category_buy_policy','override_is_regulated','override_is_regulated','Override Regulated','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,300),
        ('commodity_category_buy_policy','effective_from','effective_from','Effective From','date','date','one',true,true,true,false,NULL::jsonb,NULL::jsonb,310),
        ('commodity_category_buy_policy','effective_to','effective_to','Effective To','date','date','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,320),
        ('commodity_category_buy_policy','status','status','Status','lifecycle_state','select','one',true,true,true,false,NULL::jsonb,NULL::jsonb,330),

        ('commodity_category_sell_policy','commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one',true,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,'{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,110),
        ('commodity_category_sell_policy','business_intent_id','business_intent_id','Business Intent','uuid','reference','one',true,true,false,false,'{"ref_entity":"business_intent"}'::jsonb,'{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,120),
        ('commodity_category_sell_policy','company_code_id','company_code_id','Company Code','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,130),
        ('commodity_category_sell_policy','scope_type','scope_type','Scope Type','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,140),
        ('commodity_category_sell_policy','scope_id','scope_id','Scope','uuid','reference','zero_or_one',false,true,false,false,NULL::jsonb,NULL::jsonb,150),
        ('commodity_category_sell_policy','mapping_mode','mapping_mode','Mode','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,160),
        ('commodity_category_sell_policy','is_default','is_default','Default','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,170),
        ('commodity_category_sell_policy','is_selectable','is_selectable','Selectable','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,180),
        ('commodity_category_sell_policy','default_revenue_gl_account_id','default_revenue_gl_account_id','Revenue GL Account','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,190),
        ('commodity_category_sell_policy','default_deferred_revenue_gl_account_id','default_deferred_revenue_gl_account_id','Deferred Revenue GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,200),
        ('commodity_category_sell_policy','default_unbilled_ar_gl_account_id','default_unbilled_ar_gl_account_id','Unbilled AR GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,210),
        ('commodity_category_sell_policy','default_tax_group_id','default_tax_group_id','Default Tax Group','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"tax_group"}'::jsonb,'{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,220),
        ('commodity_category_sell_policy','default_accounting_profile_id','default_accounting_profile_id','Accounting Profile','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"accounting_profile"}'::jsonb,'{"target_entity":"accounting_profile","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,230),
        ('commodity_category_sell_policy','paired_cogs_profile_id','paired_cogs_profile_id','COGS Profile','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"accounting_profile"}'::jsonb,'{"target_entity":"accounting_profile","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,240),
        ('commodity_category_sell_policy','revenue_recognition_method','revenue_recognition_method','Revenue Recognition','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,250),
        ('commodity_category_sell_policy','variable_consideration','variable_consideration','Variable Consideration','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,260),
        ('commodity_category_sell_policy','standalone_selling_price_method','standalone_selling_price_method','Standalone Selling Price','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,270),
        ('commodity_category_sell_policy','effective_from','effective_from','Effective From','date','date','one',true,true,true,false,NULL::jsonb,NULL::jsonb,280),
        ('commodity_category_sell_policy','effective_to','effective_to','Effective To','date','date','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,290),
        ('commodity_category_sell_policy','status','status','Status','lifecycle_state','select','one',true,true,true,false,NULL::jsonb,NULL::jsonb,300),

        ('commodity_category_inventory_policy','commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one',true,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,'{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,110),
        ('commodity_category_inventory_policy','company_code_id','company_code_id','Company Code','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,120),
        ('commodity_category_inventory_policy','scope_type','scope_type','Scope Type','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,130),
        ('commodity_category_inventory_policy','scope_id','scope_id','Scope','uuid','reference','zero_or_one',false,true,false,false,NULL::jsonb,NULL::jsonb,140),
        ('commodity_category_inventory_policy','mapping_mode','mapping_mode','Mode','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,150),
        ('commodity_category_inventory_policy','stocking_status','stocking_status','Stocking Status','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,160),
        ('commodity_category_inventory_policy','valuation_method','valuation_method','Valuation Method','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,170),
        ('commodity_category_inventory_policy','default_inventory_gl_account_id','default_inventory_gl_account_id','Inventory GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,180),
        ('commodity_category_inventory_policy','default_wip_gl_account_id','default_wip_gl_account_id','WIP GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,190),
        ('commodity_category_inventory_policy','default_cogs_gl_account_id','default_cogs_gl_account_id','COGS GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,200),
        ('commodity_category_inventory_policy','default_price_variance_gl_account_id','default_price_variance_gl_account_id','Price Variance GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,210),
        ('commodity_category_inventory_policy','default_reorder_point','default_reorder_point','Reorder Point','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,220),
        ('commodity_category_inventory_policy','default_reorder_qty','default_reorder_qty','Reorder Quantity','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,230),
        ('commodity_category_inventory_policy','default_safety_stock','default_safety_stock','Safety Stock','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,240),
        ('commodity_category_inventory_policy','override_lot_tracking_required','override_lot_tracking_required','Override Lot Tracking','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,250),
        ('commodity_category_inventory_policy','override_serial_tracking_required','override_serial_tracking_required','Override Serial Tracking','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,260),
        ('commodity_category_inventory_policy','effective_from','effective_from','Effective From','date','date','one',true,true,true,false,NULL::jsonb,NULL::jsonb,270),
        ('commodity_category_inventory_policy','effective_to','effective_to','Effective To','date','date','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,280),
        ('commodity_category_inventory_policy','status','status','Status','lifecycle_state','select','one',true,true,true,false,NULL::jsonb,NULL::jsonb,290)
    ) AS f(entity_code, name, column_name, label, data_type, ui_type, cardinality,
           is_required, is_filterable, is_sortable, is_searchable, validation, reference_config, sort_order)
    WHERE e.entity_code = f.entity_code
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET
    column_name = EXCLUDED.column_name,
    data_type = EXCLUDED.data_type,
    origin = EXCLUDED.origin,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    enum_domain_code = EXCLUDED.enum_domain_code,
    enum_config = CASE
        WHEN EXCLUDED.enum_domain_code IS NOT NULL OR EXCLUDED.data_type <> 'enum' THEN NULL
        ELSE entity_field.enum_config
    END,
    is_required = EXCLUDED.is_required,
    is_filterable = EXCLUDED.is_filterable,
    is_searchable = EXCLUDED.is_searchable,
    is_sortable = EXCLUDED.is_sortable,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_category_id','business_intent_id','scope_type','mapping_mode','is_default','is_selectable','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('scope_type','mapping_mode','default_asset_profile_code','capex_screening_currency'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['commodity_category_id','business_intent_id','scope_type','scope_id','effective_from']::text[]), true),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category_buy_policy'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_category_id','business_intent_id','scope_type','mapping_mode','is_default','is_selectable','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('scope_type','mapping_mode','revenue_recognition_method','variable_consideration'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['commodity_category_id','business_intent_id','scope_type','scope_id','effective_from']::text[]), true),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category_sell_policy'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_category_id','scope_type','mapping_mode','stocking_status','valuation_method','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('scope_type','mapping_mode','stocking_status','valuation_method'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['commodity_category_id','scope_type','scope_id','effective_from']::text[]), true),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category_inventory_policy'
       AND tenant_id IS NULL;


    -- entity_operation inserts moved to 060_entity_operations/006_ops_master_data.sql

    UPDATE control.entity
       SET status = 'ARCHIVED',
           feature_flags = COALESCE(feature_flags, '{}'::jsonb)
               || jsonb_build_object(
                    'is_hidden', true,
                    'replacement_entity', CASE entity_code
                        WHEN 'company_code_supplier_posting_override' THEN 'supplier_posting_override'
                        ELSE 'commodity_category_buy_policy'
                    END
                  ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code IN (
            'company_code_spend_policy',
            'company_code_intent_policy',
            'company_code_supplier_spend_policy',
            'company_code_supplier_intent_policy',
            'company_code_supplier_posting_override'
          )
       AND tenant_id IS NULL;

    RAISE NOTICE '005_domain_registrations/300_control/002_commodity_category_policy_apps: done';
END $$;

-- Seed Gift prototype field metadata.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, reference_config,
    is_required, is_filterable, is_sortable, is_searchable, is_read_only,
    validation, sort_order, created_by
)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, f.origin, f.reference_config,
       f.is_required, f.is_filterable, f.is_sortable, f.is_searchable, f.is_read_only,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('company_code_id',  'company_code_id',  'Company Code',     'uuid',            'reference', 'one',         'standard', '{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true},"filters":{"code":"ATHQ"}}'::jsonb, true,  true,  false, false, false, '{"ref_entity":"company_code"}'::jsonb,  10),
    ('gift_code',        'gift_code',        'Gift Code',        'text',            'text',      'one',         'standard', NULL::jsonb, true,  true,  true,  true,  false, '{}'::jsonb, 20),
    ('title',            'title',            'Title',            'text',            'text',      'one',         'standard', NULL::jsonb, true,  false, true,  true,  false, '{}'::jsonb, 30),
    ('description',      'description',      'Description',      'text',            'textarea',  'zero_or_one', 'standard', NULL::jsonb, false, false, false, true,  false, '{}'::jsonb, 40),
    ('recipient_name',   'recipient_name',   'Recipient',        'text',            'text',      'zero_or_one', 'standard', NULL::jsonb, false, true,  true,  true,  false, '{}'::jsonb, 50),
    ('recipient_email',  'recipient_email',  'Recipient Email',  'text',            'email',     'zero_or_one', 'standard', NULL::jsonb, false, true,  true,  true,  false, '{"format":"email"}'::jsonb, 60),
    ('gift_type',        'gift_type',        'Gift Type',        'text',            'text',      'one',         'standard', NULL::jsonb, true,  true,  true,  true,  false, '{}'::jsonb, 70),
    ('gift_value',       'gift_value',       'Gift Value',       'decimal',         'number',    'zero_or_one', 'standard', NULL::jsonb, false, true,  true,  false, false, '{"min":0}'::jsonb, 80),
    ('currency_code',    'currency_code',    'Currency',         'text',            'text',      'one',         'standard', NULL::jsonb, true,  true,  true,  false, false, '{"length":3}'::jsonb, 90),
    ('source_ref',       'source_ref',       'Source Reference', 'text',            'text',      'zero_or_one', 'standard', NULL::jsonb, false, true,  true,  true,  false, '{}'::jsonb, 100),
    ('source_payload',   'source_payload',   'Source Payload',   'json',            'json',      'one',         'system',   NULL::jsonb, true,  false, false, false, false, '{}'::jsonb, 110),
    ('metadata',         'metadata',         'Metadata',         'json',            'json',      'one',         'system',   NULL::jsonb, true,  false, false, false, false, '{}'::jsonb, 120),
    ('status',           'status',           'Status',           'lifecycle_state', 'select',    'one',         'standard', NULL::jsonb, true,  true,  true,  false, false, '{"allowed":["draft","active","archived"]}'::jsonb, 130)
) AS f(name, column_name, label, data_type, ui_type, cardinality, origin, reference_config,
       is_required, is_filterable, is_sortable, is_searchable, is_read_only, validation, sort_order)
WHERE e.entity_code = 'seed_gift'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name       = EXCLUDED.column_name,
    label             = EXCLUDED.label,
    data_type         = EXCLUDED.data_type,
    ui_type           = EXCLUDED.ui_type,
    cardinality       = EXCLUDED.cardinality,
    origin            = EXCLUDED.origin,
    reference_config  = EXCLUDED.reference_config,
    is_required       = EXCLUDED.is_required,
    is_filterable     = EXCLUDED.is_filterable,
    is_sortable       = EXCLUDED.is_sortable,
    is_searchable     = EXCLUDED.is_searchable,
    is_read_only      = EXCLUDED.is_read_only,
    validation        = EXCLUDED.validation,
    sort_order        = EXCLUDED.sort_order,
    updated_at        = now(),
    updated_by        = EXCLUDED.created_by;


-- Hide the catch-all `metadata` jsonb column from detail/edit surfaces.
-- Runs at end-of-file so it overrides per-entity upserts (most defaulted to hidden=false,
-- which leaks internal seed tags and UUIDs). Entities that intentionally surface metadata
-- must override AFTER this sweep. See packages/shared/runtime-domain/runtime-shared/src/meta-entity/field-visibility.ts
DO $$
BEGIN
    -- Bypass the entity_field cache-invalidation trigger (it reads NEW.entity_id which doesn't
    -- exist on this table) for blanket sweeps.
    PERFORM set_config('app.bypass_version_lock', 'true', true);

    UPDATE control.entity_field
       SET visibility = jsonb_build_object('hidden', true)
     WHERE name      = 'metadata'
       AND data_type = 'jsonb'
       AND tenant_id IS NULL;
END $$;


-- Purchase invoice reference-field display fixes. Without these the detail view shows raw
-- UUIDs for commitment_id / dimension_set_id (upstream upserts only emit reference_config
-- for hand-curated entities), and audit user-ids leak into the form layout.
DO $$
BEGIN
    PERFORM set_config('app.bypass_version_lock', 'true', true);

    UPDATE control.entity_field AS ef
       SET reference_config = jsonb_build_object(
             'target_entity', 'commitment',
             'target_field',  'id',
             'label_field',   'commitment_number',
             'code_field',    'commitment_number',
             'display_field', 'commitment_number'
           ),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('renderer', 'reference_label', 'format', 'label_code')
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.entity_code = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ef.name = 'commitment_id';

    UPDATE control.entity_field AS ef
       SET reference_config = jsonb_build_object(
             'target_entity', 'dimension_set',
             'target_field',  'id',
             'label_field',   'name',
             'code_field',    'code',
             'display_field', 'name'
           ),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('renderer', 'reference_label', 'format', 'label_code')
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.entity_code = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ef.name = 'dimension_set_id';

    UPDATE control.entity_field AS ef
       SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('hide_in', ARRAY['create','edit','detail'])
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.entity_code = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ef.name IN ('approved_by','created_by','posted_by','status_changed_by','updated_by','tenant_id','id','workflow_request_id');
END $$;


-- Same display-override pattern extended to PR / PO / receipt / service_sheet.
DO $$
BEGIN
    PERFORM set_config('app.bypass_version_lock', 'true', true);

    UPDATE control.entity_field AS ef
       SET reference_config = jsonb_build_object(
             'target_entity', 'commitment',
             'target_field',  'id',
             'label_field',   'commitment_number',
             'code_field',    'commitment_number',
             'display_field', 'commitment_number'
           ),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('renderer', 'reference_label', 'format', 'label_code')
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND e.entity_code IN ('receipt','service_sheet')
       AND ef.name = 'commitment_id';

    -- requisition_id on purchase_order + commitment
    UPDATE control.entity_field AS ef
       SET reference_config = jsonb_build_object(
             'target_entity', 'purchase_requisition',
             'target_field',  'id',
             'label_field',   'requisition_number',
             'code_field',    'requisition_number',
             'display_field', 'requisition_number'
           ),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('renderer', 'reference_label', 'format', 'label_code')
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND e.entity_code IN ('purchase_order','commitment')
       AND ef.name = 'requisition_id';

    -- dimension_set_id on PR + PO + commitment
    UPDATE control.entity_field AS ef
       SET reference_config = jsonb_build_object(
             'target_entity', 'dimension_set',
             'target_field',  'id',
             'label_field',   'name',
             'code_field',    'code',
             'display_field', 'name'
           ),
           ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('renderer', 'reference_label', 'format', 'label_code')
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND e.entity_code IN ('purchase_requisition','purchase_order','commitment')
       AND ef.name = 'dimension_set_id';

    -- Audit user-ids + system FKs â†’ hide on detail across all four sisters.
    -- These belong in the audit drawer / activity timeline, not the form.
    -- NOTE: `requested_by` is a business field ("On Behalf Of" on PO,
    -- "Requester" on PR) â€” NOT an audit user-id. Excluded from this list.
    UPDATE control.entity_field AS ef
       SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                     || jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object('hide_in', ARRAY['create','edit','detail'])
                        )
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND e.entity_code IN ('purchase_requisition','purchase_order','commitment','receipt','service_sheet')
       AND ef.name IN ('approved_by','created_by','posted_by','status_changed_by','updated_by','tenant_id','id','workflow_request_id');

    -- P2P FX metadata: expose durable FX snapshot/policy columns and wire
    -- document-level exchange_rate fields to the shared fx.resolve_rate resolver.
    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type,
        cardinality, origin, enum_domain_code, is_required, is_filterable,
        validation, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type,
           f.cardinality, 'standard', NULL::text,
           f.is_required, f.is_filterable,
           f.validation, f.sort_order,
           '00000000-0000-0000-0000-000000000000'
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
      JOIN (VALUES
        ('purchase_requisition', 'fx_rate_snapshot',         'fx_rate_snapshot',         'FX Rate Snapshot',         'json',    'zero_or_one', false, false, NULL::jsonb,              392),
        ('commitment',           'fx_policy',                'fx_policy',                'FX Policy',                'text',    'one',         false, true,  NULL::jsonb,               62),
        ('commitment',           'fx_rate_snapshot',         'fx_rate_snapshot',         'FX Rate Snapshot',         'json',    'zero_or_one', false, false, NULL::jsonb,               63),
        ('receipt',              'fx_rate_snapshot',         'fx_rate_snapshot',         'FX Rate Snapshot',         'json',    'zero_or_one', false, false, NULL::jsonb,              395),
        ('service_sheet',        'fx_rate_snapshot',         'fx_rate_snapshot',         'FX Rate Snapshot',         'json',    'zero_or_one', false, false, NULL::jsonb,              395),
        ('purchase_invoice',     'fx_rate_snapshot',         'fx_rate_snapshot',         'FX Rate Snapshot',         'json',    'zero_or_one', false, false, NULL::jsonb,               75),
        ('payment_entry',        'base_currency_code',       'base_currency_code',       'Base Currency',            'text',    'one',         true,  true,  '{"max_length":3}'::jsonb, 92),
        ('payment_entry',        'exchange_rate',            'exchange_rate',            'Exchange Rate',            'decimal', 'zero_or_one', false, false, '{"min":0}'::jsonb,       94),
        ('payment_entry',        'fx_rate_snapshot',         'fx_rate_snapshot',         'FX Rate Snapshot',         'json',    'zero_or_one', false, false, NULL::jsonb,               95),
        ('payment_entry',        'payment_currency_code',    'payment_currency_code',    'Payment Currency',         'text',    'zero_or_one', false, true,  '{"max_length":3}'::jsonb, 96),
        ('payment_entry',        'payment_exchange_rate',    'payment_exchange_rate',    'Payment Exchange Rate',    'decimal', 'zero_or_one', false, false, '{"min":0}'::jsonb,       97),
        ('payment_entry',        'payment_fx_rate_snapshot', 'payment_fx_rate_snapshot', 'Payment FX Rate Snapshot', 'json',    'zero_or_one', false, false, NULL::jsonb,               98)
      ) AS f(table_name, name, column_name, label, data_type, cardinality, is_required, is_filterable, validation, sort_order)
        ON f.table_name = e.table_name
     WHERE e.table_schema = 'document'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
    ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
    SET column_name   = EXCLUDED.column_name,
        label         = EXCLUDED.label,
        data_type     = EXCLUDED.data_type,
        cardinality   = EXCLUDED.cardinality,
        origin        = EXCLUDED.origin,
        is_required   = EXCLUDED.is_required,
        is_filterable = EXCLUDED.is_filterable,
        validation    = EXCLUDED.validation,
        sort_order    = EXCLUDED.sort_order,
        updated_at    = now(),
        updated_by    = EXCLUDED.created_by;

    UPDATE control.entity_field ef
       SET defaults = jsonb_build_object(
            'on_source_change', jsonb_build_array(
              jsonb_build_object(
                'sources',  jsonb_build_array('currency_code', 'base_currency_code'),
                'action',   'rederive',
                'mode',     'if_empty_or_derived',
                'resolver', 'fx.resolve_rate',
                'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
                'message',  'Resolved from document currency, base currency, and FX policy'
              )
            )
          ),
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.table_schema = 'document'
       AND e.table_name IN (
            'purchase_requisition',
            'commitment',
            'purchase_order',
            'receipt',
            'service_sheet',
            'purchase_invoice',
            'payment_entry'
       )
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'exchange_rate';

    UPDATE control.entity_field ef
       SET ui_type = 'fx_exchange_rate',
           validation = COALESCE(ef.validation, '{}'::jsonb)
             || jsonb_build_object(
                  'snapshotField', 'fx_rate_snapshot',
                  'currencyField', 'currency_code',
                  'baseCurrencyField', 'base_currency_code'
                ),
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.table_schema = 'document'
       AND e.table_name IN (
            'purchase_requisition',
            'commitment',
            'purchase_order',
            'receipt',
            'service_sheet',
            'purchase_invoice',
            'payment_entry'
       )
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'exchange_rate';

    UPDATE control.entity_field ef
       SET ui_type = 'fx_exchange_rate',
           validation = COALESCE(ef.validation, '{}'::jsonb)
             || jsonb_build_object(
                  'snapshotField', 'payment_fx_rate_snapshot',
                  'currencyField', 'payment_currency_code',
                  'baseCurrencyField', 'base_currency_code'
                ),
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.table_schema = 'document'
       AND e.table_name = 'payment_entry'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'payment_exchange_rate';

    UPDATE control.entity_field ef
       SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
             || jsonb_build_object('hideIn', jsonb_build_array('create', 'edit', 'detail')),
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE ef.entity_version_id = ev.id
       AND e.table_schema = 'document'
       AND e.table_name IN (
            'purchase_requisition',
            'commitment',
            'purchase_order',
            'receipt',
            'service_sheet',
            'purchase_invoice',
            'payment_entry'
       )
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name IN ('fx_rate_snapshot', 'payment_fx_rate_snapshot');
END $$;
