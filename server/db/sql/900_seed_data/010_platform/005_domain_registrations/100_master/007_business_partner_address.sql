-- 100_master/007_business_partner_address.sql
-- Purpose: Register master.v_business_partner_address as business_partner_address child entity.
-- Backed by a view (address_link + address JOIN, scoped to owner_type='business_partner').
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
    (SELECT id FROM shared.module WHERE code = 'FND'),
    'business_partner_address', 'BPA', 'business_partner_address',
    'RELATION', 'system', 'ent', 'view',
    'standard', 'operational', 'controlled',
    'master', 'v_business_partner_address',
    'BP Address', 'BP Addresses', 'map-pin', 'slate',
    false,
    '{}'::jsonb,
    '{"parent_entity":"business_partner","parent_fk":"owner_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE entity_code = 'business_partner_address' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_address' AND e.tenant_id IS NULL
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
    ('purpose',           'purpose',           'Purpose',          'enum',         'one',          'master.address_purpose'::text, true,  true,  NULL::jsonb, 10),
    ('is_primary',        'is_primary',        'Primary',          'boolean',      'one',          NULL::text,                    true,  true,  NULL::jsonb, 20),
    ('city',              'city',              'City',             'text',         'zero_or_one',  NULL::text,                    false, true,  NULL::jsonb, 30),
    ('country_code',      'country_code',      'Country',          'text',         'zero_or_one',  NULL::text,                    false, true,  NULL::jsonb, 40),
    ('formatted_address', 'formatted_address', 'Formatted Address','text',         'zero_or_one',  NULL::text,                    false, false, NULL::jsonb, 50),
    ('address_type',      'address_type',      'Address Type',     'enum',         'zero_or_one',  'master.address_type'::text,   false, true,  NULL::jsonb, 60),
    ('effective_from',    'effective_from',    'Effective From',   'date',         'one',          NULL::text,                    true,  true,  NULL::jsonb, 70),
    ('effective_until',   'effective_until',   'Effective Until',  'date',         'zero_or_one',  NULL::text,                    false, false, NULL::jsonb, 80),
    ('line1',             'line1',             'Address Line 1',   'text',         'zero_or_one',  NULL::text,                    false, false, NULL::jsonb, 90),
    ('postal_code',       'postal_code',       'Postal Code',      'text',         'zero_or_one',  NULL::text,                    false, true,  NULL::jsonb, 100),
    ('owner_id',          'owner_id',          'Owner',            'uuid',         'one',          NULL::text,                    true,  false, NULL::jsonb, 110),
    ('address_id',        'address_id',        'Address Record',   'uuid',         'one',          NULL::text,                    true,  false, NULL::jsonb, 120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'business_partner_address' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config ────────────────────────────────────────────────────────
UPDATE control.entity
SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["purpose","city","country_code","is_primary","effective_from"]'::jsonb,
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Address',   'fields',jsonb_build_array('purpose','is_primary','formatted_address','line1','city','postal_code','country_code','address_type')),
            jsonb_build_object('label','Validity',  'fields',jsonb_build_array('effective_from','effective_until')),
            jsonb_build_object('label','Technical', 'collapsed',true, 'fields',jsonb_build_array('id','address_id','owner_id','created_at','metadata'))
        ),
        'default_sort_field', 'is_primary',
        'default_sort_order', 'desc'
    ),
    natural_key_fields = ARRAY['owner_id', 'purpose']
WHERE entity_code = 'business_partner_address' AND tenant_id IS NULL;
