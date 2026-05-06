-- 100_master/018_customer_app_index.sql
-- Purpose: control.entity + entity_version + entity_field for customer_app_index
-- Module: CRM (Customer Relationship Management)
-- Role: INDEX entity — denormalized list/search surface for master.customer_app_index
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
    (SELECT id FROM shared.module WHERE code = 'CRM'),
    'customer_app_index', 'CAI', 'customer_app_index',
    'AGGREGATE', 'system', 'aggregate', 'table',
    'standard', 'business', 'locked',
    'master', 'customer_app_index',
    'Customer Index', 'Customer Index', 'users', 'teal',
    false,
    '{}'::jsonb,
    '{}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'customer_app_index'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'customer_app_index'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field ──────────────────────────────────────────────────
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
ON CONFLICT DO NOTHING;

-- ── 4. display_config — list surface ─────────────────────────────────────────
UPDATE control.entity
SET display_config = jsonb_build_object(
        'list_renderer',      'table',
        'code_field',         'customer_code',
        'title_field',        'name',
        'subtitle_field',     'legal_name',
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'list_columns',       jsonb_build_array('name','customer_code','customer_status','customer_type','is_key_account','registration_country_code','risk_rating'),
        'search_fields',      jsonb_build_array('search_text')
    )
WHERE table_schema = 'master' AND table_name = 'customer_app_index'
  AND tenant_id IS NULL;

-- ── 5. natural_key_fields ─────────────────────────────────────────────────────
UPDATE control.entity
SET natural_key_fields = ARRAY['customer_code']
WHERE table_schema = 'master' AND table_name = 'customer_app_index'
  AND tenant_id IS NULL AND natural_key_fields = '{}';
