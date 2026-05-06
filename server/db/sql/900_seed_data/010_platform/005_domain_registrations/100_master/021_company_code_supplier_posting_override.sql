-- 100_master/021_company_code_supplier_posting_override.sql
-- Purpose: Register master.company_code_supplier_posting_override as an entity
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
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'company_code_supplier_posting_override', 'CSPO', 'company_code_supplier_posting_override',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'sensitive', 'controlled',
    'master', 'company_code_supplier_posting_override',
    'Supplier Posting Override', 'Supplier Posting Overrides', 'book-open', 'rose',
    false,
    '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master'
      AND table_name   = 'company_code_supplier_posting_override'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'company_code_supplier_posting_override' AND e.tenant_id IS NULL
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
    ('supplier_profile_id', 'supplier_profile_id', 'Supplier Profile',  'uuid',          'one',        NULL::text, true,  true,  NULL::jsonb, 10),
    ('posting_role_code',   'posting_role_code',   'Posting Role',      'text',          'one',        NULL,       true,  true,  NULL,        20),
    ('gl_account_id',       'gl_account_id',       'GL Account',        'uuid',          'one',        NULL,       true,  true,  NULL,        30),
    ('book_code',           'book_code',           'Book',              'text',          'one',        NULL,       true,  true,  NULL,        40),
    ('effective_from',      'effective_from',      'Effective From',    'date',          'one',        NULL,       true,  true,  NULL,        50),
    ('effective_to',        'effective_to',        'Effective To',      'date',          'zero_or_one',NULL,       false, true,  NULL,        60),
    ('reason',              'reason',              'Reason',            'text',          'zero_or_one',NULL,       false, false, NULL,        70),
    ('status',              'status',              'Status',            'lifecycle_state','one',       NULL,       true,  true,  NULL,        80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'company_code_supplier_posting_override' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config     = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["posting_role_code","gl_account_id","book_code","effective_from","effective_to"]'::jsonb,
        'default_sort_field', 'effective_from',
        'default_sort_order', 'desc',
        'drawer_groups', jsonb_build_array(
            jsonb_build_object('label', 'Override', 'fields',
                jsonb_build_array('posting_role_code','gl_account_id','book_code')),
            jsonb_build_object('label', 'Effectivity', 'fields',
                jsonb_build_array('effective_from','effective_to')),
            jsonb_build_object('label', 'Meta', 'fields',
                jsonb_build_array('reason','status'))
        )
    ),
    natural_key_fields = ARRAY['supplier_profile_id', 'posting_role_code', 'book_code', 'effective_from']
WHERE table_schema = 'master' AND table_name = 'company_code_supplier_posting_override'
  AND tenant_id IS NULL;

UPDATE control.entity_field ef
SET reference_config = v.reference_config,
    validation       = COALESCE(ef.validation, '{}'::jsonb)
                       || jsonb_build_object('ref_entity', v.target_entity)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('supplier_profile_id', 'company_code_supplier_profile', jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id')),
    ('gl_account_id',       'gl_account',                     jsonb_build_object('target_entity','gl_account','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)))
) AS v(field_name, target_entity, reference_config)
WHERE ef.entity_version_id = ev.id
  AND v.field_name = ef.name
  AND e.entity_code = 'company_code_supplier_posting_override'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND (
      ef.reference_config IS DISTINCT FROM v.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM v.target_entity
  );
