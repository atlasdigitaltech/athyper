-- 100_master/025_business_partner_role_summary.sql
-- Purpose: Register master.v_business_partner_role_summary as a BP Overview read model.
-- Backed by a view. One row per supplier/customer role for a business partner.
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
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'business_partner_role_summary', 'BPRS', 'business_partner_role_summary',
    'AGGREGATE', 'system', 'aggregate', 'view',
    'standard', 'business', 'locked',
    'master', 'v_business_partner_role_summary',
    'Business Partner Role Summary', 'Business Partner Role Summaries', 'combine', 'indigo',
    false,
    '{}'::jsonb,
    '{"parent_entity":"business_partner","parent_fk":"business_partner_id","is_readonly":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE entity_code = 'business_partner_role_summary'
      AND tenant_id IS NULL
);

UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
    || '{"parent_entity":"business_partner","parent_fk":"business_partner_id","is_readonly":true}'::jsonb,
    backing_type = 'view',
    mutability = 'locked'
WHERE entity_code = 'business_partner_role_summary'
  AND tenant_id IS NULL;

-- 2. control.entity_version
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_role_summary'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

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
WHERE e.entity_code = 'business_partner_role_summary'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- 4. display_config
UPDATE control.entity
SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'detail_profile',     'read-only',
        'list_columns',       jsonb_build_array('role_label','role_code','role_type','status','company_scope_count','is_blocked'),
        'search_fields',      jsonb_build_array('role_kind','role_label','role_code','role_type'),
        'default_sort_field', 'display_order',
        'default_sort_order', 'asc',
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Role',      'fields',jsonb_build_array('role_label','role_code','role_type','status','is_active','is_blocked')),
            jsonb_build_object('label','Scope',     'fields',jsonb_build_array('active_scope_count','company_scope_count','blocked_scope_count','primary_currency_code')),
            jsonb_build_object('label','Readiness', 'fields',jsonb_build_array('is_payment_ready','is_key_account','risk_rating')),
            jsonb_build_object('label','Metrics',   'fields',jsonb_build_array('open_document_count','ytd_amount','ytd_currency_code')),
            jsonb_build_object('label','Technical', 'collapsed',true, 'fields',jsonb_build_array('business_partner_id','role_entity_code','role_record_id','created_at','updated_at'))
        )
    ),
    natural_key_fields = ARRAY['business_partner_id','role_kind']
WHERE entity_code = 'business_partner_role_summary'
  AND tenant_id IS NULL;
