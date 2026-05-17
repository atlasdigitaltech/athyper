-- 100_master/005_business_partner_tax_profile.sql
-- Purpose: Register master.business_partner_tax_profile as business_partner_tax_profile entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING
-- Field naming rules:
--   ef_id_suffix_chk  : name ending _id → must be uuid/reference/uuid[]; use _number for tax IDs
--   ef_bool_naming_chk: booleans must start with is_/has_/can_/allow_/enable_

-- ── 0. Normalize prior vendor/supplier seeding to BP ownership ───────────────
UPDATE control.entity
SET name = 'business_partner_tax_profile',
    entity_code = 'business_partner_tax_profile',
    entity_short = 'BPTP',
    table_name = 'party_tax_profile',
    feature_flags = COALESCE(feature_flags, '{}'::jsonb)
        || '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner","pii_bearing":true}'::jsonb
WHERE table_schema = 'master'
  AND table_name IN ('supplier_tax_profile','business_partner_tax_profile','party_tax_profile')
  AND entity_code IN ('vendor_tax_profile', 'supplier_tax_profile')
  AND tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM control.entity existing
      WHERE existing.entity_code = 'business_partner_tax_profile'
        AND existing.tenant_id IS NULL
  );

UPDATE control.entity
SET table_name = 'party_tax_profile'
WHERE table_schema = 'master' AND table_name = 'business_partner_tax_profile'
  AND entity_code = 'business_partner_tax_profile' AND tenant_id IS NULL;

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
    'business_partner_tax_profile', 'BPTP', 'business_partner_tax_profile',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'party_tax_profile',
    'Business Partner Tax Profile', 'Business Partner Tax Profiles', 'receipt-tax', 'orange',
    false,
    '{}'::jsonb,
    '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner","pii_bearing":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
    || '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner","pii_bearing":true}'::jsonb
WHERE entity_code = 'business_partner_tax_profile'
  AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_tax_profile' AND e.tenant_id IS NULL
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
    ('vat_registration_doc_id',    'vat_registration_doc_id',  'VAT Registration Document','uuid',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             105),
    ('has_tax_clearance',         'has_tax_clearance',        'Tax Clearance',            'boolean',         'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             110),
    ('tax_clearance_number',      'tax_clearance_number',     'Tax Clearance Number',     'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             120),
    ('tax_clearance_doc_id',       'tax_clearance_doc_id',     'Tax Clearance Document',   'uuid',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             125),
    ('tax_clearance_expiry_date', 'tax_clearance_expiry_date','Clearance Expiry Date',    'date',            'zero_or_one',  NULL::text,                                 false, true,  NULL::jsonb,                             130),
    ('global_location_number',    'global_location_number',   'Global Location Number',   'text',            'zero_or_one',  NULL::text,                                 false, false, '{"pattern":"^\\d{13}$"}'::jsonb,        140),
    ('penalty_information',        'penalty_information',      'Penalty Information',      'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             160),
    ('discount_information',       'discount_information',     'Discount Information',     'text',            'zero_or_one',  NULL::text,                                 false, false, NULL::jsonb,                             170),
    ('status',                    'status',                   'Status',                   'lifecycle_state', 'one',          NULL::text,                                 true,  true,  NULL::jsonb,                             200)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'business_partner_tax_profile' AND e.table_name = 'party_tax_profile'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["country_code","tax_classification","taxation_type","vat_number","tax_clearance_expiry_date","status"]'::jsonb,
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Tax Position',      'fields',jsonb_build_array('country_code','tax_classification','taxation_type','global_location_number')),
            jsonb_build_object('label','Tax Identifiers',   'fields',jsonb_build_array('tax_number','state_tax_number','sales_tax_number','service_tax_number','regional_tax_number','vat_number')),
            jsonb_build_object('label','VAT / GST',         'fields',jsonb_build_array('is_vat_registered','vat_number','vat_registration_doc_id')),
            jsonb_build_object('label','Tax Clearance',     'fields',jsonb_build_array('has_tax_clearance','tax_clearance_number','tax_clearance_expiry_date','tax_clearance_doc_id')),
            jsonb_build_object('label','Notes',             'fields',jsonb_build_array('penalty_information','discount_information')),
            jsonb_build_object('label','Technical',         'collapsed',true, 'fields',jsonb_build_array('created_at','updated_at','status_changed_at','metadata'))
        ),
        'default_sort_field', 'country_code',
        'default_sort_order', 'asc'
    ),
    natural_key_fields    = ARRAY['country_code']
WHERE entity_code = 'business_partner_tax_profile' AND tenant_id IS NULL;
