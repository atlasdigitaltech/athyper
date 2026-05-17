-- 100_master/026_business_partner_app_index.sql
-- Purpose: register master.v_business_partner_app_index as the Business Partner
--          meta-entity list surface.
-- BP detail remains backed by master.business_partner; only list/search uses
-- this role-aware view through business_partner.feature_flags.list_entity_code.

INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'business_partner_app_index', 'BPAI', 'business_partner_app_index',
    'AGGREGATE', 'system', 'aggregate', 'view',
    'standard', 'business', 'locked',
    'master', 'v_business_partner_app_index',
    'Business Partner Index', 'Business Partner Index', 'combine', 'indigo',
    false,
    '{}'::jsonb,
    '{"is_readonly":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

UPDATE control.entity
SET backing_type = 'view',
    mutability = 'locked',
    feature_flags = COALESCE(feature_flags, '{}'::jsonb) || '{"is_readonly":true}'::jsonb
WHERE entity_code = 'business_partner_app_index'
  AND tenant_id IS NULL;

INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'business_partner_app_index'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

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
WHERE e.entity_code = 'business_partner_app_index'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity
SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'list_renderer',      'table',
        'code_field',         'code',
        'title_field',        'name',
        'subtitle_field',     'legal_name',
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'list_columns',       jsonb_build_array(
            'code','name','role_summary','registration_country_code',
            'supplier_code','customer_code','status'
        ),
        'search_fields',      jsonb_build_array('search_text')
    ),
    natural_key_fields = ARRAY['code']
WHERE entity_code = 'business_partner_app_index'
  AND tenant_id IS NULL;
