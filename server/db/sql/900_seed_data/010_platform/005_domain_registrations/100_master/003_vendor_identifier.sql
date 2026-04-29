-- 100_master/003_supplier_identifier.sql
-- Purpose: Register master.party_identifier as supplier_identifier child entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior seeding as 'vendor_identifier' ────────────────────
UPDATE control.entity
SET name = 'supplier_identifier', entity_code = 'supplier_identifier', entity_short = 'SPI'
WHERE table_schema = 'master' AND table_name = 'party_identifier'
  AND entity_code = 'vendor_identifier' AND tenant_id IS NULL;

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
    'supplier_identifier', 'SPI', 'supplier_identifier',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'party_identifier',
    'Supplier Identifier', 'Supplier Identifiers', 'fingerprint', 'slate',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"owner_id","parent_scope":"owner_type=supplier"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'party_identifier'
      AND entity_code = 'supplier_identifier' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_identifier' AND e.tenant_id IS NULL
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
    ('scheme',              'scheme',               'Scheme',               'enum',             'one',          'master.party_identifier_scheme'::text, true,  true,  NULL::jsonb,                10),
    ('value',               'value',                'Identifier Value',     'text',             'one',          NULL::text,                             true,  true,  '{"max_length":100}'::jsonb, 20),
    ('issuing_authority',   'issuing_authority',    'Issuing Authority',    'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                30),
    ('issued_at',           'issued_at',            'Issued Date',          'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                40),
    ('valid_until',         'valid_until',          'Valid Until',          'date',             'zero_or_one',  NULL::text,                             false, true,  NULL::jsonb,                50),
    ('is_verified',         'is_verified',          'Verified',             'boolean',          'one',          NULL::text,                             true,  true,  NULL::jsonb,                60),
    ('is_primary',          'is_primary',           'Primary',              'boolean',          'one',          NULL::text,                             true,  false, NULL::jsonb,                70),
    ('status',              'status',               'Status',               'lifecycle_state',  'one',          NULL::text,                             true,  true,  NULL::jsonb,                80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_identifier' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'standard',
        'list_columns',       '["scheme","value","is_primary","is_verified","valid_until","status"]'::jsonb,
        'default_sort_field', 'scheme',
        'default_sort_order', 'asc'
    ),
    natural_key_fields    = ARRAY['scheme', 'value']
WHERE entity_code = 'supplier_identifier' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
