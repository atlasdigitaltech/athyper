-- 100_master/004_supplier_service_coverage.sql
-- Purpose: Register master.supplier_service_coverage as supplier_service_coverage entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior seeding as 'vendor_service_coverage' ───────────────
UPDATE control.entity
SET name = 'supplier_service_coverage', entity_code = 'supplier_service_coverage', entity_short = 'SSV'
WHERE table_schema = 'master' AND table_name = 'supplier_service_coverage'
  AND entity_code = 'vendor_service_coverage' AND tenant_id IS NULL;

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
    'supplier_service_coverage', 'SSV', 'supplier_service_coverage',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'supplier_service_coverage',
    'Service Coverage', 'Service Coverage', 'map-pin', 'green',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"supplier_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'supplier_service_coverage'
      AND entity_code = 'supplier_service_coverage' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_service_coverage' AND e.tenant_id IS NULL
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
    ('coverage_level',  'coverage_level',   'Coverage Level',   'text',             'one',          NULL::text, true,  true,  NULL::jsonb, 10),
    ('coverage_type',   'coverage_type',    'Coverage Type',    'text',             'one',          NULL::text, true,  true,  NULL::jsonb, 20),
    ('continent_code',  'continent_code',   'Continent',        'text',             'zero_or_one',  NULL::text, false, true,  NULL::jsonb, 30),
    ('country_code',    'country_code',     'Country',          'text',             'zero_or_one',  NULL::text, false, true,  NULL::jsonb, 40),
    ('region_name',     'region_name',      'Region / State',   'text',             'zero_or_one',  NULL::text, false, false, NULL::jsonb, 50),
    ('city_name',       'city_name',        'City',             'text',             'zero_or_one',  NULL::text, false, false, NULL::jsonb, 60),
    ('notes',           'notes',            'Notes',            'text',             'zero_or_one',  NULL::text, false, false, NULL::jsonb, 70),
    ('status',          'status',           'Status',           'lifecycle_state',  'one',          NULL::text, true,  true,  NULL::jsonb, 80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_service_coverage' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["coverage_level","coverage_type","country_code","status"]'::jsonb,
        'default_sort_field', 'coverage_type',
        'default_sort_order', 'asc'
    ),
    natural_key_fields    = ARRAY['id']
WHERE entity_code = 'supplier_service_coverage' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
