-- 100_master/016_supplier_qualification.sql
-- Purpose: Register master.supplier_qualification as supplier_qualification entity.
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
    'supplier_qualification', 'SQL', 'supplier_qualification',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'supplier_qualification',
    'Qualification & Risk', 'Qualification & Risk', 'shield-check', 'red',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"supplier_id","singleton":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'supplier_qualification'
      AND entity_code = 'supplier_qualification' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_qualification' AND e.tenant_id IS NULL
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
ON CONFLICT DO NOTHING;
