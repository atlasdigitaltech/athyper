-- 100_master/020_company_code_supplier_intent_policy.sql
-- Purpose: Register master.company_code_supplier_intent_policy as an entity
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
    'company_code_supplier_intent_policy', 'CCSI', 'company_code_supplier_intent_policy',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'company_code_supplier_intent_policy',
    'Supplier Intent Policy', 'Supplier Intent Policies', 'target', 'violet',
    false,
    '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master'
      AND table_name   = 'company_code_supplier_intent_policy'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'company_code_supplier_intent_policy' AND e.tenant_id IS NULL
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
    ('supplier_profile_id', 'supplier_profile_id', 'Supplier Profile',    'uuid',          'one',        NULL::text, true,  true,  NULL::jsonb, 10),
    ('business_intent_id',  'business_intent_id',  'Business Intent',     'uuid',          'one',        NULL,       true,  true,  NULL,        20),
    ('mapping_mode',        'mapping_mode',        'Mapping Mode',        'text',          'one',        NULL,       true,  true,  NULL,        30),
    ('is_default',          'is_default',          'Default Intent',      'boolean',       'one',        NULL,       true,  true,  NULL,        40),
    ('is_sourcing_allowed', 'is_sourcing_allowed', 'Sourcing Allowed',    'boolean',       'one',        NULL,       true,  true,  NULL,        50),
    ('is_po_allowed',       'is_po_allowed',       'PO Allowed',          'boolean',       'one',        NULL,       true,  true,  NULL,        60),
    ('is_invoice_allowed',  'is_invoice_allowed',  'Invoice Allowed',     'boolean',       'one',        NULL,       true,  true,  NULL,        70),
    ('status',              'status',              'Status',              'lifecycle_state','one',       NULL,       true,  true,  NULL,        80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'company_code_supplier_intent_policy' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config     = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["business_intent_id","mapping_mode","is_default","is_sourcing_allowed","is_po_allowed","is_invoice_allowed"]'::jsonb,
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc',
        'drawer_groups', jsonb_build_array(
            jsonb_build_object('label', 'Permissions', 'fields',
                jsonb_build_array('mapping_mode','is_default','is_sourcing_allowed','is_po_allowed','is_invoice_allowed')),
            jsonb_build_object('label', 'Meta', 'fields',
                jsonb_build_array('status'))
        )
    ),
    natural_key_fields = ARRAY['supplier_profile_id', 'business_intent_id']
WHERE table_schema = 'master' AND table_name = 'company_code_supplier_intent_policy'
  AND tenant_id IS NULL;

UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'company_code_supplier_profile', jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id')),
    ('business_intent_id',  'business_intent',               jsonb_build_object('target_entity','business_intent','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'company_code_supplier_intent_policy'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );
