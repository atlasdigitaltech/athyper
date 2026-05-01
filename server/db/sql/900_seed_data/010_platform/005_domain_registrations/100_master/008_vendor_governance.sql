-- 100_master/008_supplier_governance.sql
-- Purpose: Register master.party_governance_relation as supplier_governance entity.
-- Covers: shareholders, UBOs, directors, board members, signatories.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior seeding as 'vendor_governance' ────────────────────
UPDATE control.entity
SET name = 'supplier_governance', entity_code = 'supplier_governance', entity_short = 'SGV'
WHERE table_schema = 'master' AND table_name = 'party_governance_relation'
  AND entity_code = 'vendor_governance' AND tenant_id IS NULL;

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
    'supplier_governance', 'SGV', 'supplier_governance',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'party_governance_relation',
    'Governance Record', 'Governance Records', 'users', 'violet',
    false,
    '{}'::jsonb,
    '{"parent_entity":"supplier","parent_fk":"party_id","parent_scope":"party_type=supplier",'
    '"pii_bearing":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'party_governance_relation'
      AND entity_code = 'supplier_governance' AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_governance' AND e.tenant_id IS NULL
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
    ('relation_type',   'relation_type',    'Role',                 'enum',             'one',          'master.party_governance_role'::text,   true,  true,  NULL::jsonb,                  10),
    ('member_name',     'member_name',      'Name',                 'text',             'one',          NULL::text,                             true,  true,  '{"max_length":255}'::jsonb,  20),
    ('member_type',     'member_type',      'Member Type',          'text',             'one',          NULL::text,                             true,  true,  NULL::jsonb,                  30),
    ('company_name',    'company_name',     'Company Name',         'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  40),
    ('business_title',  'business_title',   'Title',                'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  50),
    ('ownership_pct',   'ownership_pct',    'Ownership %',          'decimal',          'zero_or_one',  NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 60),
    ('share_class',     'share_class',      'Share Class',          'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  70),
    ('appointed_date',  'appointed_date',   'Appointed Date',       'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  80),
    ('end_of_term',     'end_of_term',      'End of Term',          'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  90),
    ('notes',           'notes',            'Notes',                'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 100),
    ('status',          'status',           'Status',               'lifecycle_state',  'one',          NULL::text,                             true,  true,  NULL::jsonb,                 110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_governance' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["relation_type","member_name","member_type","status"]'::jsonb,
        'default_sort_field', 'relation_type',
        'default_sort_order', 'asc'
    ),
    natural_key_fields    = ARRAY['id']
WHERE entity_code = 'supplier_governance' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
