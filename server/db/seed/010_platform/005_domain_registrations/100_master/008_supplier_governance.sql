-- 100_master/008_business_partner_governance.sql
-- Purpose: Register master.party_governance_relation as business_partner_governance entity.
-- Covers: shareholders, UBOs, directors, board members, signatories.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior vendor/supplier seeding to BP ownership ───────────
UPDATE control.entity
SET name = 'business_partner_governance', entity_code = 'business_partner_governance', entity_short = 'BPG'
WHERE table_schema = 'master' AND table_name = 'party_governance_relation'
  AND entity_code IN ('vendor_governance', 'supplier_governance', 'party_governance_relation', 'master_party_governance_relation')
  AND tenant_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM control.entity existing
      WHERE existing.entity_code = 'business_partner_governance'
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
    'business_partner_governance', 'BPG', 'business_partner_governance',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'party_governance_relation',
    'Governance Record', 'Governance Records', 'users', 'violet',
    '{"parent_entity":"business_partner","parent_fk":"party_id","parent_scope":"party_type=business_partner",'
    '"pii_bearing":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- Repair existing installs that were previously registered as BP-owned governance.
-- Business Partner is the canonical owner for governance.
UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
    || '{"parent_entity":"business_partner","parent_fk":"party_id","parent_scope":"party_type=business_partner","pii_bearing":true}'::jsonb
WHERE entity_code = 'business_partner_governance'
  AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_governance' AND e.tenant_id IS NULL
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
    ('member_type',     'member_type',      'Member Type',          'enum',             'one',          'master.party_governance_member_type'::text,true,true,NULL::jsonb,                  30),
    ('company_name',    'company_name',     'Company Name',         'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  40),
    ('member_business_partner_id','member_business_partner_id','Linked BP',      'reference',        'zero_or_one',  NULL::text,                             false, true,  '{"ref_entity":"business_partner"}'::jsonb, 45),
    ('member_country_code','member_country_code','Country',         'text',             'zero_or_one',  NULL::text,                             false, true,  '{"max_length":2}'::jsonb,     48),
    ('business_title',  'business_title',   'Title',                'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  50),
    ('ownership_pct',   'ownership_pct',    'Ownership %',          'decimal',          'zero_or_one',  NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 60),
    ('voting_pct',      'voting_pct',       'Voting %',             'decimal',          'zero_or_one',  NULL::text,                             false, true,  '{"min":0,"max":100}'::jsonb, 62),
    ('beneficial_ownership_pct','beneficial_ownership_pct','Beneficial Ownership %','decimal','zero_or_one',NULL::text,                          false, true,  '{"min":0,"max":100}'::jsonb, 64),
    ('directness',      'directness',       'Directness',           'enum',             'zero_or_one',  'master.party_governance_directness'::text,false,true,NULL::jsonb,                  66),
    ('control_nature',  'control_nature',   'Control Nature',       'enum',             'zero_or_one',  'master.party_governance_control_nature'::text,false,true,NULL::jsonb,              68),
    ('share_class',     'share_class',      'Share Class',          'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  70),
    ('authority_scope', 'authority_scope',  'Authority Scope',      'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  74),
    ('authority_limit_amount','authority_limit_amount','Authority Limit','decimal',     'zero_or_one',  NULL::text,                             false, false, '{"min":0}'::jsonb,           76),
    ('authority_limit_currency_code','authority_limit_currency_code','Authority Currency','text',       'zero_or_one',  NULL::text,                             false, false, '{"max_length":3}'::jsonb,     78),
    ('appointed_date',  'appointed_date',   'Appointed Date',       'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  80),
    ('end_of_term',     'end_of_term',      'End of Term',          'date',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                  90),
    ('kyc_status',      'kyc_status',       'KYC Status',           'enum',             'one',          'master.party_governance_kyc_status'::text,true,true,NULL::jsonb,                 100),
    ('sanctions_status','sanctions_status', 'Sanctions Status',     'enum',             'one',          'master.party_governance_sanctions_status'::text,true,true,NULL::jsonb,           102),
    ('pep_status',      'pep_status',       'PEP Status',           'enum',             'one',          'master.party_governance_pep_status'::text,true,true,NULL::jsonb,                 104),
    ('last_screened_at','last_screened_at', 'Last Screened',        'timestamptz',      'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 106),
    ('evidence_status', 'evidence_status',  'Evidence Status',      'enum',             'one',          'master.party_governance_evidence_status'::text,true,true,NULL::jsonb,            108),
    ('source_of_wealth','source_of_wealth', 'Source of Wealth',     'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 110),
    ('last_reviewed_at','last_reviewed_at', 'Last Reviewed',        'timestamptz',      'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 112),
    ('next_review_at',  'next_review_at',   'Next Review',          'date',             'zero_or_one',  NULL::text,                             false, true,  NULL::jsonb,                 114),
    ('reviewed_by',     'reviewed_by',      'Reviewed By',          'uuid',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 116),
    ('notes',           'notes',            'Notes',                'text',             'zero_or_one',  NULL::text,                             false, false, NULL::jsonb,                 120),
    ('status',          'status',           'Status',               'lifecycle_state',  'one',          NULL::text,                             true,  true,  NULL::jsonb,                 130)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'business_partner_governance' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity_field ef
SET data_type = sub.data_type,
    enum_domain_code = sub.enum_domain_code,
    ui_type = COALESCE(sub.ui_type, ef.ui_type),
    reference_config = CASE
        WHEN sub.name = 'member_business_partner_id'
        THEN '{"target_entity":"business_partner","display_field":"name"}'::jsonb
        ELSE ef.reference_config
    END
FROM (
    SELECT ef.id,
           f.name,
           f.data_type,
           f.enum_domain_code,
           f.ui_type
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ef.entity_version_id = ev.id
    JOIN control.entity e ON e.id = ev.entity_id
    JOIN (VALUES
        ('member_type', 'enum', 'master.party_governance_member_type'::text, NULL::text),
        ('member_business_partner_id', 'reference', NULL::text, 'reference'::text),
        ('member_country_code', 'text', NULL::text, 'country'::text),
        ('directness', 'enum', 'master.party_governance_directness'::text, NULL::text),
        ('control_nature', 'enum', 'master.party_governance_control_nature'::text, NULL::text),
        ('kyc_status', 'enum', 'master.party_governance_kyc_status'::text, NULL::text),
        ('sanctions_status', 'enum', 'master.party_governance_sanctions_status'::text, NULL::text),
        ('pep_status', 'enum', 'master.party_governance_pep_status'::text, NULL::text),
        ('evidence_status', 'enum', 'master.party_governance_evidence_status'::text, NULL::text)
    ) AS f(name, data_type, enum_domain_code, ui_type) ON ef.name = f.name
    WHERE e.entity_code = 'business_partner_governance'
      AND e.tenant_id IS NULL AND ev.version_no = 1
) AS sub
WHERE ef.id = sub.id;

-- ── 4. display_config + natural_key_fields ───────────────────────────────────
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array(
            'member_name','relation_type','member_type',
            'ownership_pct','voting_pct','beneficial_ownership_pct',
            'kyc_status','sanctions_status','pep_status','next_review_at','status'
        ),
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object(
                'label','Member',
                'fields',jsonb_build_array(
                    'member_name','member_type','company_name',
                    'member_business_partner_id','member_country_code'
                )),
            jsonb_build_object(
                'label','Role & Control',
                'fields',jsonb_build_array(
                    'relation_type','business_title','ownership_pct','voting_pct',
                    'beneficial_ownership_pct','directness','control_nature','share_class'
                )),
            jsonb_build_object(
                'label','Authority',
                'fields',jsonb_build_array(
                    'authority_scope','authority_limit_amount','authority_limit_currency_code'
                )),
            jsonb_build_object(
                'label','Tenure',
                'fields',jsonb_build_array('appointed_date','end_of_term','status')),
            jsonb_build_object(
                'label','Compliance',
                'fields',jsonb_build_array(
                    'kyc_status','sanctions_status','pep_status',
                    'last_screened_at','evidence_status','source_of_wealth'
                )),
            jsonb_build_object(
                'label','Review',
                'fields',jsonb_build_array('last_reviewed_at','next_review_at','reviewed_by')),
            jsonb_build_object(
                'label','Notes',
                'fields',jsonb_build_array('notes')),
            jsonb_build_object(
                'label','Technical',
                'collapsed',true,
                'fields',jsonb_build_array('id','created_at','metadata'))
        ),
        'default_sort_field', 'member_name',
        'default_sort_order', 'asc'
    ),
    identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['id']::text[]), true)
WHERE entity_code = 'business_partner_governance' AND tenant_id IS NULL;
