-- 100_master/003_business_partner_identifier.sql
-- Purpose: Register master.party_identifier as business_partner_identifier child entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior vendor/supplier seeding to BP ownership ───────────
UPDATE control.entity
SET name = 'business_partner_identifier', entity_code = 'business_partner_identifier', entity_short = 'BPI'
WHERE table_schema = 'master' AND table_name = 'party_identifier'
  AND entity_code IN ('vendor_identifier', 'supplier_identifier', 'party_identifier', 'master_party_identifier')
  AND tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM control.entity existing
      WHERE existing.entity_code = 'business_partner_identifier'
        AND existing.tenant_id IS NULL
  );

-- ── 1. control.entity ────────────────────────────────────────────────────────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'BUY'),
    'business_partner_identifier', 'BPI', 'business_partner_identifier',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'party_identifier',
    'Business Partner Identifier', 'Business Partner Identifiers', 'fingerprint', 'slate',
    '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- Repair existing installs that were previously registered as BP-owned identifiers.
-- Business Partner is the canonical owner for external identifiers.
UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
    || '{"parent_entity":"business_partner","parent_fk":"owner_id","parent_scope":"owner_type=business_partner"}'::jsonb
WHERE entity_code = 'business_partner_identifier'
  AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_identifier' AND e.tenant_id IS NULL
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
WHERE e.entity_code = 'business_partner_identifier' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["scheme","value","valid_until","status"]'::jsonb,
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Identifier', 'fields',jsonb_build_array('scheme','value','issuing_authority')),
            jsonb_build_object('label','Validity',   'fields',jsonb_build_array('issued_at','valid_until','is_primary','is_verified','status')),
            jsonb_build_object('label','Technical',  'collapsed',true, 'fields',jsonb_build_array('id','created_at','metadata'))
        ),
        'default_sort_field', 'scheme',
        'default_sort_order', 'asc'
    ),
    identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['scheme', 'value']::text[]), true)
WHERE entity_code = 'business_partner_identifier' AND tenant_id IS NULL;
