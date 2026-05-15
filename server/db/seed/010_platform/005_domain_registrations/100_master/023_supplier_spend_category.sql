-- 100_master/023_supplier_spend_category.sql
-- Purpose: Register master.supplier_spend_category as supplier_spend_category entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

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
    'supplier_spend_category', 'SSC', 'supplier_spend_category',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'supplier_spend_category',
    'Supplier Spend Category', 'Supplier Spend Categories', 'tags', 'amber',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"supplier_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'supplier_spend_category'
      AND entity_code = 'supplier_spend_category' AND tenant_id IS NULL
);

-- 2. control.entity_version
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_spend_category' AND e.tenant_id IS NULL
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
    ('spend_category_id', 'spend_category_id', 'Spend Category', 'uuid',            'one',         NULL::text, true,  true,  NULL::jsonb, 20),
    ('is_primary',        'is_primary',        'Primary',        'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb, 30),
    ('effective_from',    'effective_from',    'Effective From', 'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb, 40),
    ('effective_until',   'effective_until',   'Effective Until','date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb, 50),
    ('notes',             'notes',             'Notes',          'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb, 60),
    ('status',            'status',            'Status',         'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb, 70)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_spend_category' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- 4. display_config + natural_key_fields
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array('spend_category_id','is_primary','effective_from','effective_until','status'),
        'search_fields',      jsonb_build_array('notes','status'),
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Category',  'fields',jsonb_build_array('spend_category_id','is_primary','status')),
            jsonb_build_object('label','Validity',  'fields',jsonb_build_array('effective_from','effective_until')),
            jsonb_build_object('label','Notes',     'fields',jsonb_build_array('notes')),
            jsonb_build_object('label','Technical', 'collapsed',true, 'fields',jsonb_build_array('id','created_at'))
        ),
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc'
    ),
    natural_key_fields    = ARRAY['supplier_id','spend_category_id']
WHERE entity_code = 'supplier_spend_category' AND tenant_id IS NULL;

UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'supplier_spend_category'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.name IN ('notes','status')
  AND ef.is_searchable = false;
