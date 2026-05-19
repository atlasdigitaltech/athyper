-- 100_master/007_business_partner_contact_person.sql
-- Purpose: Register master.party_contact_person as business_partner_contact_person entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior vendor/supplier seeding to BP ownership ───────────
UPDATE control.entity
SET name = 'business_partner_contact_person', entity_code = 'business_partner_contact_person', entity_short = 'BPCP'
WHERE table_schema = 'master' AND table_name = 'party_contact_person'
  AND entity_code IN ('vendor_contact_person', 'supplier_contact_person', 'party_contact_person', 'master_party_contact_person')
  AND tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM control.entity existing
      WHERE existing.entity_code = 'business_partner_contact_person'
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
    'business_partner_contact_person', 'BPCP', 'business_partner_contact_person',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'party_contact_person',
    'Contact Person', 'Contact Persons', 'user-circle', 'indigo',
    '{"parent_entity":"business_partner","parent_fk":"party_id","parent_scope":"party_type=business_partner",'
    '"has_roles":true,"role_entity":"party_contact_role"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
    || '{"parent_entity":"business_partner","parent_fk":"party_id","parent_scope":"party_type=business_partner","has_roles":true,"role_entity":"party_contact_role"}'::jsonb
WHERE entity_code = 'business_partner_contact_person'
  AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_contact_person' AND e.tenant_id IS NULL
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
-- Inline contact/address columns removed (Part B of 01i_tables_party_master.sql).
-- Channels → master.contact_link; addresses → master.address_link.
CROSS JOIN (VALUES
    ('contact_name',   'contact_name',   'Contact Name',    'text',            'one',         NULL::text,                 true,  true,  '{"max_length":255}'::jsonb, 10),
    ('business_title', 'business_title', 'Business Title / Position', 'text',   'zero_or_one', NULL::text,                 false, false, NULL::jsonb,                 20),
    ('contact_role',   'contact_role',   'Functional Role',           'enum',   'zero_or_one', 'master.contact_role',      false, true,  NULL::jsonb,                 25),
    ('is_primary',     'is_primary',     'Main Contact',              'boolean','one',         NULL::text,                 true,  true,  NULL::jsonb,                 30),
    ('contact_email',  'contact_email',  'Email Address',             'text',   'zero_or_one', NULL::text,                 false, false, '{"format":"email"}'::jsonb,  35),
    ('contact_phone',  'contact_phone',  'Phone Number',              'text',   'zero_or_one', NULL::text,                 false, false, NULL::jsonb,                 36),
    ('contact_fax',    'contact_fax',    'Fax Number',                'text',   'zero_or_one', NULL::text,                 false, false, NULL::jsonb,                 37),
    ('status',         'status',         'Status',          'lifecycle_state', 'one',         NULL::text,                 true,  true,  NULL::jsonb,                 40)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'business_partner_contact_person' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity_field ef
SET label = v.label
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
JOIN (VALUES
    ('business_title', 'Business Title / Position'),
    ('contact_role',   'Functional Role'),
    ('is_primary',     'Main Contact'),
    ('contact_email',  'Email Address'),
    ('contact_phone',  'Phone Number'),
    ('contact_fax',    'Fax Number')
) AS v(name, label) ON true
WHERE ef.entity_version_id = ev.id
  AND v.name = ef.name
  AND e.entity_code = 'business_partner_contact_person'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;

UPDATE control.entity_field ef
SET ui_type = v.ui_type,
    origin  = 'standard'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
JOIN (VALUES
    ('contact_email', 'email'),
    ('contact_phone', 'phone'),
    ('contact_fax',   'phone')
) AS v(name, ui_type) ON true
WHERE ef.entity_version_id = ev.id
  AND v.name = ef.name
  AND e.entity_code = 'business_partner_contact_person'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1;

-- ── 4. Deactivate stale inline contact/address fields ─────────────────────────
UPDATE control.entity_field ef
SET is_active = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'party_contact_person'
  AND e.entity_code = 'business_partner_contact_person' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
    'email','phone_calling_code','phone_area','phone_number','phone_extension',
    'fax_calling_code','fax_area','fax_number','fax_extension',
    'address_line1','address_line2','city','state_region','postal_code','address_country_code'
  );

-- ── 5. display_config + natural_key_fields ───────────────────────────────────
-- drawer_fields controls which fields appear in the detail drawer (ordered).
-- Audit fields (created_at, updated_at) are rendered in a collapsed Audit section
-- by the runtime — they must be listed last.
-- party_type, metadata, is_active are excluded entirely (noise in business UI).
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array('contact_name','business_title','contact_role','status'),
        'drawer_fields',      jsonb_build_array(
            'contact_name','business_title','contact_role','is_primary','status',
            'created_at','updated_at'
        ),
        'default_sort_field', 'is_primary',
        'default_sort_order', 'desc'
    ),
    identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['id']::text[]), true)
WHERE entity_code = 'business_partner_contact_person' AND tenant_id IS NULL;
