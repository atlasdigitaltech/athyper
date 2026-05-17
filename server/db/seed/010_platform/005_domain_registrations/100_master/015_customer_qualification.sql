-- 100_master/015_customer_qualification.sql
-- Purpose: Register master.customer_qualification as customer_qualification entity.
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
    'customer_qualification', 'CQL', 'customer_qualification',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'customer_qualification',
    'Credit & Qualification', 'Credit & Qualification', 'shield-check', 'red',
    false,
    '{}'::jsonb,
    '{"parent_entity":"customer","parent_fk":"customer_id","singleton":true,"pii_bearing":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'customer_qualification' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field ──────────────────────────────────────────────────
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
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["credit_status","kyc_status","aml_sanctions_status","status"]'::jsonb,
        'default_sort_field', 'credit_status',
        'default_sort_order', 'asc'
    ),
    natural_key_fields    = ARRAY['id']
WHERE entity_code = 'customer_qualification' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
