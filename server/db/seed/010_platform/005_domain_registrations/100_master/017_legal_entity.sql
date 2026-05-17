-- 100_master/017_legal_entity.sql
-- Purpose: control.entity + entity_version + entity_field for Legal Entity (master.legal_entity)
-- Module: ACC (Finance Core)
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
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'legal_entity', 'LGE', 'legal_entity',
    'MASTER', 'system', 'ent', 'table',
    'full', 'tenant_critical', 'controlled',
    'master', 'legal_entity',
    'Legal Entity', 'Legal Entities', 'landmark', 'purple',
    true,
    '{"prefix":"LE","prefix_configurable":false,"separator":"-","segments":[{"type":"sequence","padding":4}]}'::jsonb,
    '{"is_approvable":false,"party_category":"legal_entity","allow_address":true,"allow_contact":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'legal_entity'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field — core statutory / finance fields ─────────────────
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
    ('code',                       'code',                       'Entity Code',              'text',            'one',         NULL::text,                             true,  true,  '{"max_length":20}'::jsonb,   10),
    ('name',                       'name',                       'Entity Name',              'text',            'one',         NULL::text,                             true,  true,  '{"max_length":255}'::jsonb,  20),
    ('display_name',               'display_name',               'Display Name',             'text',            'zero_or_one', NULL::text,                             false, false, '{"max_length":255}'::jsonb,  25),
    ('legal_name',                 'legal_name',                 'Legal Name',               'text',            'zero_or_one', NULL::text,                             false, false, '{"max_length":255}'::jsonb,  30),
    ('entity_type',                'entity_type',                'Entity Type',              'enum',            'one',         'master.legal_entity_type'::text,        true,  true,  NULL::jsonb,                  40),
    ('legal_form',                 'legal_form',                 'Legal Form',               'enum',            'zero_or_one', 'master.legal_form'::text,               false, true,  NULL::jsonb,                  50),
    ('registration_no',            'registration_no',            'Registration No.',         'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                  55),
    ('registration_country_code',  'registration_country_code',  'Country of Incorporation', 'text',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  57),
    ('country_code',               'country_code',               'Operating Country',        'text',            'one',         NULL::text,                             true,  true,  NULL::jsonb,                  60),
    ('tax_residence_country_code', 'tax_residence_country_code', 'Tax Residence Country',    'text',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  65),
    ('functional_currency',        'functional_currency',        'Functional Currency',      'text',            'one',         NULL::text,                             true,  true,  '{"max_length":3}'::jsonb,    70),
    ('reporting_currency',         'reporting_currency',         'Reporting Currency',       'text',            'one',         NULL::text,                             true,  true,  '{"max_length":3}'::jsonb,    75),
    ('regulatory_framework',       'regulatory_framework',       'Regulatory Framework',     'enum',            'zero_or_one', 'master.legal_entity_framework'::text,   false, true,  NULL::jsonb,                  80),
    ('tax_registration_number',    'tax_registration_number',    'Tax Registration No.',     'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                  85),
    ('incorporation_date',         'incorporation_date',         'Incorporation Date',       'date',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  90),
    ('effective_from',             'effective_from',             'Effective From',           'date',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  92),
    ('effective_until',            'effective_until',            'Effective Until',          'date',            'zero_or_one', NULL::text,                             false, true,  NULL::jsonb,                  94),
    ('consolidation_method',       'consolidation_method',       'Consolidation Method',     'enum',            'one',         'master.legal_entity_consolidation'::text, true, true, NULL::jsonb,                 96),
    ('ownership_pct',              'ownership_pct',              'Ownership %',              'decimal',         'zero_or_one', NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 98),
    ('website_url',                'website_url',                'Website',                  'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                 100),
    ('external_ref',               'external_ref',               'External Ref',             'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                 105),
    ('description',                'description',                'Description',              'text',            'zero_or_one', NULL::text,                             false, false, NULL::jsonb,                 110),
    ('status',                     'status',                     'Status',                   'lifecycle_state', 'one',         NULL::text,                             true,  true,  NULL::jsonb,                 120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'legal_entity'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. Extended profile fields (added via 01i_tables_party_master.sql) ────────
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
    ('aliases',             'aliases',             'Aliases',             'text[]',  'many',        NULL::text,                        false, false, NULL::jsonb,                     125),
    ('business_types',      'business_types',      'Business Types',      'enum[]',  'many',        'master.business_type'::text,       false, true,  NULL::jsonb,                     126),
    ('founded_year',        'founded_year',        'Founded Year',        'integer', 'zero_or_one', NULL::text,                        false, true,  '{"min":1800,"max":2200}'::jsonb, 127),
    ('employee_count_band', 'employee_count_band', 'Employee Count',      'enum',    'zero_or_one', 'master.employee_count_band'::text, false, true,  NULL::jsonb,                     128),
    ('annual_revenue_band', 'annual_revenue_band', 'Annual Revenue Band', 'enum',    'zero_or_one', 'master.annual_revenue_band'::text, false, true,  NULL::jsonb,                     129)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'legal_entity'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 5. Migration: update existing rows to reflect corrections ─────────────────
-- Runs safely on re-seed; no-op if already correct.
DO $$
DECLARE v_entity_id uuid;
BEGIN
    SELECT e.id INTO v_entity_id
    FROM control.entity e
    WHERE e.table_schema = 'master' AND e.table_name = 'legal_entity'
      AND e.tenant_id IS NULL;

    IF v_entity_id IS NULL THEN RETURN; END IF;

    -- 5a. Neutralize legal_form domain
    UPDATE control.entity_field ef
    SET    enum_domain_code = 'master.legal_form'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'legal_form'
      AND  ef.enum_domain_code = 'master.supplier_legal_form';

    -- 5b. Neutralize business_types domain
    UPDATE control.entity_field ef
    SET    enum_domain_code = 'master.business_type'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'business_types'
      AND  ef.enum_domain_code = 'master.supplier_business_type';

    -- 5c. Fix country_code label and add registration fields
    UPDATE control.entity_field ef
    SET    label = 'Operating Country'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'country_code'
      AND  ef.label = 'Country of Incorp.';

    -- 5d. Wire regulatory_framework to its enum domain
    UPDATE control.entity_field ef
    SET    data_type = 'enum',
           enum_domain_code = 'master.legal_entity_framework'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'regulatory_framework'
      AND  ef.enum_domain_code IS NULL;

    -- 5e. Wire consolidation_method to its enum domain
    UPDATE control.entity_field ef
    SET    data_type = 'enum',
           enum_domain_code = 'master.legal_entity_consolidation'
    FROM   control.entity_version ev
    WHERE  ev.entity_id = v_entity_id
      AND  ef.entity_version_id = ev.id
      AND  ef.column_name = 'consolidation_method'
      AND  ef.enum_domain_code IS NULL;
END $$;
