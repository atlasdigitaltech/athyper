-- 100_master/006_supplier_certification.sql
-- Purpose: Register master.certification as supplier_certification child entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING
-- Field naming rules:
--   ef_id_suffix_chk: name ending _id → data_type must be 'uuid' (not 'uuid_ref')

-- ── 0. Normalize any prior seeding as 'vendor_certification' ─────────────────
UPDATE control.entity
SET name = 'supplier_certification', entity_code = 'supplier_certification', entity_short = 'SCT'
WHERE table_schema = 'master' AND table_name = 'certification'
  AND entity_code = 'vendor_certification' AND tenant_id IS NULL;

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
    'supplier_certification', 'SCT', 'supplier_certification',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'certification',
    'Certification', 'Certifications', 'award', 'yellow',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"owner_id","parent_scope":"owner_type=supplier",'
    '"allow_attachment":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'certification'
      AND entity_code = 'supplier_certification' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_certification' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field ──────────────────────────────────────────────────
-- FK reference columns (ending _id) → data_type 'uuid' per ef_id_suffix_chk
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
    ('certification_type_id',  'certification_type_id',   'Certification Type',   'uuid',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  10),
    ('custom_name',            'custom_name',             'Custom Name',          'text',            'zero_or_one', NULL::text, false, false, '{"max_length":255}'::jsonb,  20),
    ('certificate_number',     'certificate_number',      'Certificate No.',      'text',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  30),
    ('certified_by',           'certified_by',            'Certified By',         'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  40),
    ('certified_location',     'certified_location',      'Certified Location',   'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  50),
    ('effective_from',         'effective_from',          'Effective Date',       'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  60),
    ('effective_until',        'effective_until',         'Expiry Date',          'date',            'zero_or_one', NULL::text, false, true,  NULL::jsonb,                  70),
    ('additional_info',        'additional_info',         'Additional Info',      'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  80),
    ('document_attachment_id', 'document_attachment_id',  'Document',             'uuid',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                  90),
    ('status',                 'status',                  'Status',               'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb,                 100)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_certification' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'standard',
        'list_columns',       '["custom_name","certificate_number","effective_from","effective_until","status"]'::jsonb,
        'default_sort_field', 'effective_from',
        'default_sort_order', 'desc'
    ),
    natural_key_fields    = ARRAY['id']
WHERE entity_code = 'supplier_certification' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
