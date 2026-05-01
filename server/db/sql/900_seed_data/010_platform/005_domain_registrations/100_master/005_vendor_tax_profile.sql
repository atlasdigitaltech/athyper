-- 100_master/005_supplier_tax_profile.sql
-- Purpose: Register master.supplier_tax_profile as supplier_tax_profile entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING
-- Field naming rules:
--   ef_id_suffix_chk  : name ending _id → must be uuid/reference/uuid[]; use _number for tax IDs
--   ef_bool_naming_chk: booleans must start with is_/has_/can_/allow_/enable_

-- ── 0. Normalize prior seeding: vendor_tax_profile → supplier_tax_profile → party_tax_profile ──
UPDATE control.entity
SET name = 'supplier_tax_profile', entity_code = 'supplier_tax_profile', entity_short = 'STP'
WHERE table_schema = 'master' AND table_name IN ('supplier_tax_profile','party_tax_profile')
  AND entity_code = 'vendor_tax_profile' AND tenant_id IS NULL;

UPDATE control.entity
SET table_name = 'party_tax_profile'
WHERE table_schema = 'master' AND table_name = 'supplier_tax_profile'
  AND entity_code = 'supplier_tax_profile' AND tenant_id IS NULL;

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
    'supplier_tax_profile', 'STP', 'supplier_tax_profile',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'party_tax_profile',
    'Tax Profile', 'Tax Profiles', 'receipt-tax', 'orange',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"owner_id","parent_scope":"owner_type=supplier","pii_bearing":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'party_tax_profile'
      AND entity_code = 'supplier_tax_profile' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_tax_profile' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field ──────────────────────────────────────────────────
-- _id columns mapped to _number field names (column_name retains actual DB column)
-- vat_registered → is_vat_registered (boolean naming convention)
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
    ('country_code',              'country_code',             'Country',                  'text',            'one',          NULL::text,                                 true,  true,  NULL::jsonb,                              10),
    ('tax_classification',        'tax_classification',       'Tax Classification',       'enum',            'zero_or_one',  'master.supplier_tax_classification'::text, false, true,  NULL::jsonb,                              20),
    ('taxation_type',             'taxation_type',            'Taxation Type',            'enum',            'zero_or_one',  'master.supplier_taxation_type'::text,      false, true,  NULL::jsonb,                              30),
    ('tax_number',                'tax_id',                   'Tax ID',                   'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              40),
    ('state_tax_number',          'state_tax_id',             'State Tax ID',             'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              50),
    ('sales_tax_number',          'sales_tax_id',             'Sales Tax ID',             'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              60),
    ('service_tax_number',        'service_tax_id',           'Service Tax ID',           'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              70),
    ('regional_tax_number',       'regional_tax_id',          'Regional Tax ID',          'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                              80),
    ('vat_number',                'vat_id',                   'VAT ID',                   'text',            'zero_or_one',  NULL::text,                                 false, true,  NULL::jsonb,                              90),
    ('is_vat_registered',         'vat_registered',           'VAT Registered',           'boolean',         'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             100),
    ('has_tax_clearance',         'has_tax_clearance',        'Tax Clearance',            'boolean',         'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             110),
    ('tax_clearance_number',      'tax_clearance_number',     'Tax Clearance Number',     'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             120),
    ('tax_clearance_expiry_date', 'tax_clearance_expiry_date','Clearance Expiry Date',    'date',            'zero_or_one',  NULL::text,                                 false, true,  NULL::jsonb,                             130),
    ('global_location_number',    'global_location_number',   'Global Location Number',   'text',            'zero_or_one',  NULL::text,                                 false, false, '{"pattern":"^\\d{13}$"}'::jsonb,        140),
    ('status',                    'status',                   'Status',                   'lifecycle_state', 'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             150)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_tax_profile' AND e.table_name = 'party_tax_profile'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["country_code","tax_classification","is_vat_registered","has_tax_clearance","status"]'::jsonb,
        'default_sort_field', 'country_code',
        'default_sort_order', 'asc'
    ),
    natural_key_fields    = ARRAY['country_code']
WHERE entity_code = 'supplier_tax_profile' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
