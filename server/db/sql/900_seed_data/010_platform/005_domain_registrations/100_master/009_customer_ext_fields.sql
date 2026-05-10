-- 100_master/009_customer_ext_fields.sql
-- Purpose: Align customer entity registration with the three-party master model.
-- §1: Deactivate stale AR-behavior fields (belong in company_code_customer_profile)
-- §2: Fix tax_number column_name mapping (DB column is tax_id)
-- §3: Add missing core identity/legal fields
-- §4: Add extended business profile fields (mirror of 002_supplier_ext_fields.sql)
-- Idempotent: UPDATE with WHERE clauses; ON CONFLICT DO NOTHING

-- ── §1. Deactivate stale fields ───────────────────────────────────────────────
UPDATE control.entity_field ef
SET is_active = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('payment_terms', 'currency_code', 'credit_limit',
                  'contact_email', 'contact_phone');

-- ── §2. Fix tax_number column_name (DB column is tax_id, not tax_number) ──────
UPDATE control.entity_field ef
SET column_name = 'tax_id'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'tax_number' AND ef.column_name = 'tax_number';

-- ── §3. Add missing core identity / legal fields ──────────────────────────────
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
ON CONFLICT DO NOTHING;

-- ── §4. Extended business profile fields ──────────────────────────────────────
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
    ('aliases',             'aliases',             'Aliases',             'text[]',  'many',        NULL::text,                             false, false, NULL::jsonb,                    110),
    ('business_types',      'business_types',      'Business Types',      'enum[]',  'many',        'master.business_type'::text,           false, true,  NULL::jsonb,                    120),
    ('legal_form',          'legal_form',          'Legal Form',          'enum',    'zero_or_one', 'master.legal_form'::text,              false, true,  NULL::jsonb,                    130),
    ('founded_year',        'founded_year',        'Founded Year',        'integer', 'zero_or_one', NULL::text,                             false, true,  '{"min":1800,"max":2200}'::jsonb, 140),
    ('employee_count_band', 'employee_count_band', 'Employee Count',      'enum',    'zero_or_one', 'master.employee_count_band'::text,     false, true,  NULL::jsonb,                    150),
    ('annual_revenue_band', 'annual_revenue_band', 'Annual Revenue Band', 'enum',    'zero_or_one', 'master.annual_revenue_band'::text,     false, true,  NULL::jsonb,                    160)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.entity_code  = 'customer' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Migration: neutralize domain refs on existing rows ────────────────────────
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
