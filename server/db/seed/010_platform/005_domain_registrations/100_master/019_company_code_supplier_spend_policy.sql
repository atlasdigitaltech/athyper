-- 100_master/019_company_code_supplier_spend_policy.sql
-- Purpose: Register master.company_code_supplier_spend_policy as an entity
--          with version, fields, and display_config.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, feature_flags, status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'company_code_supplier_spend_policy', 'CCSS', 'company_code_supplier_spend_policy',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'company_code_supplier_spend_policy',
    'Supplier Spend Policy', 'Supplier Spend Policies', 'tag', 'amber',
    false,
    '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master'
      AND table_name   = 'company_code_supplier_spend_policy'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'company_code_supplier_spend_policy' AND e.tenant_id IS NULL
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
    ('supplier_profile_id',   'supplier_profile_id',   'Supplier Profile',     'uuid',          'one',        NULL::text, true,  true,  NULL::jsonb, 10),
    ('spend_category_id',     'spend_category_id',     'Spend Category',       'uuid',          'one',        NULL,       true,  true,  NULL,        20),
    ('mapping_mode',          'mapping_mode',          'Mapping Mode',         'text',          'one',        NULL,       true,  true,  NULL,        30),
    ('sourcing_status',       'sourcing_status',       'Sourcing Status',      'text',          'one',        NULL,       true,  true,  NULL,        40),
    ('qualification_status',  'qualification_status',  'Qualification Status', 'text',          'one',        NULL,       true,  true,  NULL,        50),
    ('po_status',             'po_status',             'PO Status',            'text',          'one',        NULL,       true,  true,  NULL,        60),
    ('invoice_status',        'invoice_status',        'Invoice Status',       'text',          'one',        NULL,       true,  true,  NULL,        70),
    ('valid_from',            'valid_from',            'Valid From',           'date',          'zero_or_one',NULL,       false, true,  NULL,        80),
    ('valid_until',           'valid_until',           'Valid Until',          'date',          'zero_or_one',NULL,       false, true,  NULL,        90),
    ('max_po_amount',         'max_po_amount',         'Max PO Amount',        'decimal',       'zero_or_one',NULL,       false, false, NULL,        100),
    ('max_po_currency_code',  'max_po_currency_code',  'Max PO Currency',      'text',          'zero_or_one',NULL,       false, false, NULL,        110),
    ('is_preferred_supplier', 'is_preferred_supplier', 'Preferred Supplier',   'boolean',       'one',        NULL,       true,  true,  NULL,        120),
    ('notes',                 'notes',                 'Notes',                'text',          'zero_or_one',NULL,       false, false, NULL,        130),
    ('status',                'status',                'Status',               'lifecycle_state','one',       NULL,       true,  true,  NULL,        140)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'company_code_supplier_spend_policy' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config     = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["spend_category_id","sourcing_status","po_status","invoice_status","qualification_status"]'::jsonb,
        'search_fields',      jsonb_build_array('mapping_mode','sourcing_status','po_status','invoice_status','qualification_status','max_po_currency_code','notes','status'),
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc',
        'drawer_groups', jsonb_build_array(
            jsonb_build_object('label', 'Eligibility', 'fields',
                jsonb_build_array('mapping_mode','sourcing_status','po_status','invoice_status','qualification_status')),
            jsonb_build_object('label', 'Limits', 'fields',
                jsonb_build_array('max_po_amount','max_po_currency_code','valid_from','valid_until')),
            jsonb_build_object('label', 'Meta', 'fields',
                jsonb_build_array('is_preferred_supplier','notes','status'))
        )
    ),
    natural_key_fields = ARRAY['supplier_profile_id', 'spend_category_id']
WHERE table_schema = 'master' AND table_name = 'company_code_supplier_spend_policy'
  AND tenant_id IS NULL;

UPDATE control.entity_field ef
SET is_searchable = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'company_code_supplier_spend_policy'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.name IN (
      'mapping_mode',
      'sourcing_status',
      'po_status',
      'invoice_status',
      'qualification_status',
      'max_po_currency_code',
      'notes',
      'status'
  )
  AND ef.is_searchable = false;

UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'company_code_supplier_profile', jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id')),
    ('spend_category_id',   'spend_category',                 jsonb_build_object('target_entity','spend_category','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'company_code_supplier_spend_policy'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );
