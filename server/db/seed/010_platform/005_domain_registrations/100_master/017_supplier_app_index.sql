-- 100_master/017_supplier_app_index.sql
-- Purpose: control.entity + entity_version + entity_field for supplier_app_index
-- Module: BUY (Buying)
-- Role: INDEX entity — denormalized list/search surface for master.supplier_app_index
-- entity_class = 'AGGREGATE' — read-only from app; written exclusively by DB triggers
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
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
    'supplier_app_index', 'SAI', 'supplier_app_index',
    'AGGREGATE', 'system', 'aggregate', 'table',
    'standard', 'business', 'locked',
    'master', 'supplier_app_index',
    'Supplier Index', 'Supplier Index', 'building-2', 'blue',
    false,
    '{}'::jsonb,
    '{}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'supplier_app_index'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field ──────────────────────────────────────────────────
-- All columns are standard/system — no user-configurable fields on an index entity.
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
    -- Search surface — single searchable field covering all key text content
    ('search_text',                'search_text',                'Search',                  'text',          'one',        NULL::text,                   false, false, true,  NULL::jsonb,                 200)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier_app_index'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config — list surface ─────────────────────────────────────────
-- This entity is never rendered in detail view; display_config only drives list.
UPDATE control.entity
SET display_config = jsonb_build_object(
        'list_renderer',      'table',
        'code_field',         'supplier_code',
        'title_field',        'name',
        'subtitle_field',     'legal_name',
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'list_columns',       jsonb_build_array('name','supplier_code','supplier_status','supplier_type','registration_country_code','is_payment_ready'),
        'search_fields',      jsonb_build_array('search_text')
    )
WHERE table_schema = 'master' AND table_name = 'supplier_app_index'
  AND tenant_id IS NULL;

-- ── 5. natural_key_fields ─────────────────────────────────────────────────────
UPDATE control.entity
SET natural_key_fields = ARRAY['supplier_code']
WHERE table_schema = 'master' AND table_name = 'supplier_app_index'
  AND tenant_id IS NULL AND natural_key_fields = '{}';
