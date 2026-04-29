-- 100_master/007_supplier_contact_person.sql
-- Purpose: Register master.party_contact_person as supplier_contact_person entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior seeding as 'vendor_contact_person' ────────────────
UPDATE control.entity
SET name = 'supplier_contact_person', entity_code = 'supplier_contact_person', entity_short = 'SCP'
WHERE table_schema = 'master' AND table_name = 'party_contact_person'
  AND entity_code = 'vendor_contact_person' AND tenant_id IS NULL;

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
    'supplier_contact_person', 'SCP', 'supplier_contact_person',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'party_contact_person',
    'Contact Person', 'Contact Persons', 'user-circle', 'indigo',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"party_id","parent_scope":"party_type=supplier",'
    '"has_roles":true,"role_entity":"supplier_contact_role"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'party_contact_person'
      AND entity_code = 'supplier_contact_person' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_contact_person' AND e.tenant_id IS NULL
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
    ('contact_name',   'contact_name',   'Contact Name',    'text',            'one',         NULL::text, true,  true,  '{"max_length":255}'::jsonb, 10),
    ('business_title', 'business_title', 'Business Title',  'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb,                 20),
    ('is_primary',     'is_primary',     'Primary Contact', 'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb,                 30),
    ('status',         'status',         'Status',          'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb,                 40)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_contact_person' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. Deactivate stale inline contact/address fields ─────────────────────────
UPDATE control.entity_field ef
SET is_active = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'party_contact_person'
  AND e.entity_code = 'supplier_contact_person' AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN (
    'email','phone_calling_code','phone_area','phone_number','phone_extension',
    'fax_calling_code','fax_area','fax_number','fax_extension',
    'address_line1','address_line2','city','state_region','postal_code','address_country_code'
  );
