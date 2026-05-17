-- 100_master/023_supplier_commodity_category.sql
-- Purpose: Register master.supplier_spend_category as supplier_commodity_category entity.
-- Idempotent: normalizes the generated master_schema_coverage entity if it
-- already claimed the physical table as master_supplier_spend_category.

DELETE FROM control.entity_lifecycle
WHERE entity_name = 'supplier_spend_category';

-- 1. control.entity
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'supplier_commodity_category', 'SCC', 'supplier_commodity_category',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'supplier_spend_category',
    'Supplier Commodity Category', 'Supplier Commodity Categories', 'tags', 'amber',
    false,
    '{}'::jsonb,
    '{
        "parent_entity":"supplier",
        "parent_fk":"supplier_id",
        "generic_runtime_disabled":false,
        "records_api_disabled":false,
        "is_hidden":false,
        "is_readonly":false,
        "is_exportable":true
    }'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO UPDATE
   SET module_id        = EXCLUDED.module_id,
       name             = EXCLUDED.name,
       entity_short     = EXCLUDED.entity_short,
       entity_code      = EXCLUDED.entity_code,
       entity_class     = EXCLUDED.entity_class,
       ownership_model  = EXCLUDED.ownership_model,
       kind             = EXCLUDED.kind,
       backing_type     = EXCLUDED.backing_type,
       governance_level = EXCLUDED.governance_level,
       security_tier    = EXCLUDED.security_tier,
       mutability       = EXCLUDED.mutability,
       label_singular   = EXCLUDED.label_singular,
       label_plural     = EXCLUDED.label_plural,
       icon_key         = EXCLUDED.icon_key,
       color_token      = EXCLUDED.color_token,
       numbering_active = EXCLUDED.numbering_active,
       naming_policy    = EXCLUDED.naming_policy,
       feature_flags    = COALESCE(control.entity.feature_flags, '{}'::jsonb)
                           || EXCLUDED.feature_flags,
       status           = 'ACTIVE',
       updated_at       = now(),
       updated_by       = '00000000-0000-0000-0000-000000000000';

-- 2. control.entity_version
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_commodity_category' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

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
ON CONFLICT DO NOTHING;

-- 4. display_config + natural_key_fields
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'hidden',             false,
        'readOnly',           false,
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array('commodity_category_id','is_primary','effective_from','effective_until','status'),
        'search_fields',      jsonb_build_array('notes','status'),
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Category',  'fields',jsonb_build_array('commodity_category_id','is_primary','status')),
            jsonb_build_object('label','Validity',  'fields',jsonb_build_array('effective_from','effective_until')),
            jsonb_build_object('label','Notes',     'fields',jsonb_build_array('notes')),
            jsonb_build_object('label','Technical', 'collapsed',true, 'fields',jsonb_build_array('id','created_at'))
        ),
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc'
    ),
    feature_flags         = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object(
        'generic_runtime_disabled', false,
        'records_api_disabled',     false,
        'is_hidden',                false,
        'is_readonly',              false,
        'is_exportable',            true
    ),
    natural_key_fields    = ARRAY['supplier_id','commodity_category_id']
WHERE entity_code = 'supplier_commodity_category' AND tenant_id IS NULL;

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

INSERT INTO control.entity_lifecycle
    (tenant_id, entity_name, lifecycle_id, priority, created_by)
SELECT NULL::uuid, 'supplier_commodity_category', lc.id, 100,
       '00000000-0000-0000-0000-000000000000'
FROM control.lifecycle lc
WHERE lc.code = 'lc_active_inactive'
  AND lc.tenant_id IS NULL
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

UPDATE control.entity_version ev
SET version_hash = encode(sha256(convert_to(
        ev.id::text || ':' || COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'name', ef.name,
                       'data_type', ef.data_type,
                       'ui_type', ef.ui_type,
                       'is_read_only', ef.is_read_only,
                       'validation', ef.validation,
                       'reference_config', ef.reference_config
                   ) ORDER BY ef.sort_order, ef.name)::text
            FROM control.entity_field ef
            WHERE ef.entity_version_id = ev.id
        ), '[]'),
        'UTF8'
    )), 'hex'),
    updated_at   = now(),
    updated_by   = '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE ev.entity_id = e.id
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND e.entity_code = 'supplier_commodity_category';
