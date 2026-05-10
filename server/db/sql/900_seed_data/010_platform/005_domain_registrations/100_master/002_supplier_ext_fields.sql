-- 100_master/002_supplier_ext_fields.sql
-- Purpose: Add extended business profile fields to the supplier entity registration.
-- Covers the columns added via ALTER TABLE master.supplier in 01b_tables_finance.sql.
-- Idempotent: ON CONFLICT DO NOTHING
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
    ('aliases',             'aliases',              'Aliases',              'text[]',       'many',        NULL::text,                             false, false, NULL::jsonb,                            110),
    ('business_types',      'business_types',       'Business Types',       'enum[]',       'many',        'master.business_type'::text,           false, true,  NULL::jsonb,                            120),
    ('legal_form',          'legal_form',           'Legal Form',           'enum',         'zero_or_one', 'master.legal_form'::text,              false, true,  NULL::jsonb,                            130),
    ('founded_year',        'founded_year',         'Founded Year',         'integer',      'zero_or_one', NULL::text,                             false, true,  '{"min":1800,"max":2200}'::jsonb,        140),
    ('employee_count_band', 'employee_count_band',  'Employee Count',       'enum',         'zero_or_one', 'master.employee_count_band'::text,     false, true,  NULL::jsonb,                            150),
    ('annual_revenue_band', 'annual_revenue_band',  'Annual Revenue Band',  'enum',         'zero_or_one', 'master.annual_revenue_band'::text,     false, true,  NULL::jsonb,                            160)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.entity_code = 'supplier' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

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

-- ── Migration: neutralize domain refs on existing rows ────────────────────────
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
