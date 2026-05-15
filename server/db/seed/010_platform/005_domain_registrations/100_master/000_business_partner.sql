-- 100_master/000_business_partner.sql
-- Purpose: control.entity + entity_version + entity_field for Business Partner (master.business_partner)
-- Module: ACC (Core)
-- BP-first architecture: business_partner is the commercial identity root.
--   Customer (master.customer) and Supplier (master.supplier) are thin role tables.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 1. control.entity (fallback — 020_entities/008_master_partners.sql runs first) ────
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'business_partner', 'BP', 'business_partner',
    'MASTER', 'system', 'ent', 'table',
    'full', 'operational', 'extensible',
    'master', 'business_partner',
    'Business Partner', 'Business Partners', 'building', 'indigo',
    true,
    '{"prefix":"BP","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":6}]}'::jsonb,
    '{
      "is_approvable": false,
      "party_category": "business_partner",
      "allow_address": true,
      "allow_contact": true,
      "is_readonly": false,
      "list_entity_code": "business_partner_app_index",
      "duplicate_check": {
        "hard_gate": true,
        "block_on_exact": true,
        "exact_fields": ["registration_no", "identifier", "tax_number"],
        "strong_name_threshold": 0.85,
        "weak_name_threshold": 0.55,
        "redirect_modes": ["edit_existing", "extend_role", "extend_company_code"]
      },
      "extension_modes": ["supplier_role", "customer_role", "supplier_company_code", "customer_company_code"],
      "ownership_lanes": {
        "identity": ["name", "legal_name", "registration_no", "registration_country_code", "tax_residence_country_code"],
        "supplier": ["supplier_type", "spend_category_id", "payment_term_id", "payment_method_id"],
        "customer": ["customer_type", "is_key_account", "risk_rating"],
        "finance_ap": ["company_code_supplier_profile"],
        "finance_ar": ["company_code_customer_profile"]
      }
    }'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'business_partner'
      AND tenant_id IS NULL
);

-- ── Ensure Business Partner identity can be edited (re-run safe) ─────────────
UPDATE control.entity
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || '{
      "is_readonly": false,
      "list_entity_code": "business_partner_app_index",
      "duplicate_check": {
        "hard_gate": true,
        "block_on_exact": true,
        "exact_fields": ["registration_no", "identifier", "tax_number"],
        "strong_name_threshold": 0.85,
        "weak_name_threshold": 0.55,
        "redirect_modes": ["edit_existing", "extend_role", "extend_company_code"]
      },
      "extension_modes": ["supplier_role", "customer_role", "supplier_company_code", "customer_company_code"],
      "ownership_lanes": {
        "identity": ["name", "legal_name", "registration_no", "registration_country_code", "tax_residence_country_code"],
        "supplier": ["supplier_type", "spend_category_id", "payment_term_id", "payment_method_id"],
        "customer": ["customer_type", "is_key_account", "risk_rating"],
        "finance_ap": ["company_code_supplier_profile"],
        "finance_ar": ["company_code_customer_profile"]
      }
    }'::jsonb
WHERE table_schema = 'master' AND table_name = 'business_partner'
  AND tenant_id IS NULL;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND  e.tenant_id IS NULL
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
    ('code',                       'code',                       'BP Code',                  'text',          'one',         NULL::text,                          true,  true,  '{"max_length":30}'::jsonb,  10),
    ('name',                       'name',                       'Name',                     'text',          'one',         NULL::text,                          true,  true,  '{"max_length":255}'::jsonb, 20),
    ('display_name',               'display_name',               'Display Name',             'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":255}'::jsonb, 30),
    ('partner_category',           'partner_category',           'Category',                 'enum',          'one',         'master.business_partner_category',  true,  true,  NULL::jsonb,                 40),
    ('legal_name',                 'legal_name',                 'Legal Name',               'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":255}'::jsonb, 50),
    ('legal_form',                 'legal_form',                 'Legal Form',               'enum',          'zero_or_one', 'master.legal_form',                  false, true,  '{"max_length":100}'::jsonb, 72),
    ('registration_no',            'registration_no',            'Registration No.',         'text',          'zero_or_one', NULL::text,                          false, true,  '{"max_length":100}'::jsonb, 60),
    ('registration_country_code',  'registration_country_code',  'Registration Country',     'text',          'zero_or_one', NULL::text,                          false, true,  '{"max_length":3}'::jsonb,   70),
    ('tax_residence_country_code', 'tax_residence_country_code', 'Tax Residence Country',    'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":3}'::jsonb,   75),
    ('website_url',                'website_url',                'Website',                  'text',          'zero_or_one', NULL::text,                          false, false, '{"format":"url"}'::jsonb,   80),
    ('parent_business_partner_id', 'parent_business_partner_id', 'Parent Business Partner',   'uuid',          'zero_or_one', NULL::text,                          false, true,  '{"ref_entity":"business_partner"}'::jsonb, 85),
    ('description',                'description',                'Description',              'text',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 90),
    ('aliases',                    'aliases',                    'Aliases',                  'text_array',    'many',        NULL::text,                          false, false, NULL::jsonb,                100),
    ('tags',                       'tags',                       'Tags',                     'jsonb',         'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                110),
    ('business_types',             'business_types',             'Business Types',           'text_array',    'many',        NULL::text,                          false, false, NULL::jsonb,                120),
    ('founded_year',               'founded_year',               'Founded Year',             'integer',       'zero_or_one', NULL::text,                          false, false, '{"min":1800,"max":2100}'::jsonb, 130),
    ('employee_count_band',        'employee_count_band',        'Employee Count',           'enum',          'zero_or_one', 'master.employee_count_band',        false, false, NULL::jsonb,                140),
    ('annual_revenue_band',        'annual_revenue_band',        'Annual Revenue Band',      'enum',          'zero_or_one', 'master.annual_revenue_band',        false, false, NULL::jsonb,                150),
    ('status',                     'status',                     'Status',                   'lifecycle_state','one',        NULL::text,                          true,  true,  NULL::jsonb,                200),
    ('external_ref',               'external_ref',               'External Reference',       'text',          'zero_or_one', NULL::text,                          false, false, '{"max_length":100}'::jsonb, 210),
    ('long_description',           'long_description',           'Long Description',         'text',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 95),
    ('incorporation_date',         'incorporation_date',         'Incorporation Date',        'date',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 77),
    ('effective_from',             'effective_from',             'Effective From',            'date',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 82),
    ('effective_until',            'effective_until',            'Effective Until',           'date',          'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                 84),
    ('metadata',                   'metadata',                   'Metadata',                  'jsonb',         'zero_or_one', NULL::text,                          false, false, NULL::jsonb,                220)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- BP meta-list projection fields. These are sourced from
-- master.v_business_partner_app_index for list/search only; detail and writes
-- still use the canonical master.business_partner table.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    is_searchable, validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       f.is_required, f.is_filterable, f.is_searchable,
       NULL::jsonb, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('role_summary',        'role_summary',        'Roles',           'text',            'one',         NULL::text,                   true,  true,  true,   35),
    ('role_count',          'role_count',          'Role Count',      'integer',         'one',         NULL::text,                   true,  true,  false,  36),
    ('role_kinds',          'role_kinds',          'Role Kinds',      'text_array',      'many',        NULL::text,                   false, true,  true,   37),
    ('role_codes',          'role_codes',          'Role Codes',      'text',            'zero_or_one', NULL::text,                   false, true,  true,   38),
    ('has_supplier_role',   'has_supplier_role',   'Supplier',        'boolean',         'one',         NULL::text,                   true,  true,  false,  39),
    ('has_customer_role',   'has_customer_role',   'Customer',        'boolean',         'one',         NULL::text,                   true,  true,  false,  40),
    ('is_dual_role',        'is_dual_role',        'Dual Role',       'boolean',         'one',         NULL::text,                   true,  true,  false,  41),
    ('supplier_code',       'supplier_code',       'Supplier Code',   'text',            'zero_or_one', NULL::text,                   false, true,  true,  170),
    ('supplier_status',     'supplier_status',     'Supplier Status', 'lifecycle_state', 'zero_or_one', NULL::text,                   false, true,  false, 171),
    ('is_payment_ready',    'is_payment_ready',    'Payment Ready',   'boolean',         'zero_or_one', NULL::text,                   false, true,  false, 172),
    ('customer_code',       'customer_code',       'Customer Code',   'text',            'zero_or_one', NULL::text,                   false, true,  true,  180),
    ('customer_status',     'customer_status',     'Customer Status', 'lifecycle_state', 'zero_or_one', NULL::text,                   false, true,  false, 181),
    ('is_key_account',      'is_key_account',      'Key Account',     'boolean',         'zero_or_one', NULL::text,                   false, true,  false, 182),
    ('risk_rating',         'risk_rating',         'Risk Rating',     'enum',            'zero_or_one', 'master.credit_rating'::text, false, true,  false, 183),
    ('company_scope_count', 'company_scope_count', 'Company Scopes',  'integer',         'one',         NULL::text,                   true,  true,  false, 184),
    ('active_scope_count',  'active_scope_count',  'Active Scopes',   'integer',         'one',         NULL::text,                   true,  true,  false, 185),
    ('blocked_scope_count', 'blocked_scope_count', 'Blocked Scopes',  'integer',         'one',         NULL::text,                   true,  true,  false, 186),
    ('is_blocked',          'is_blocked',          'Blocked',         'boolean',         'one',         NULL::text,                   true,  true,  false, 187),
    ('search_text',         'search_text',         'Search',          'text',            'one',         NULL::text,                   true,  false, true,  900)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, is_searchable, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Upgrade legal_form to enum (master.legal_form) if previously text ────────
UPDATE control.entity_field
SET data_type        = 'enum',
    enum_domain_code = 'master.legal_form'
WHERE id IN (
    SELECT ef.id
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ef.entity_version_id = ev.id
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.table_schema = 'master' AND e.table_name = 'business_partner'
      AND e.tenant_id IS NULL AND ev.version_no = 1
      AND ef.name = 'legal_form'
      AND (ef.data_type IS DISTINCT FROM 'enum'
           OR ef.enum_domain_code IS DISTINCT FROM 'master.legal_form')
);

UPDATE control.entity_field
SET data_type   = sub.data_type,
    cardinality = sub.cardinality,
    ui_type     = COALESCE(sub.ui_type, control.entity_field.ui_type),
    sort_order  = sub.sort_order,
    reference_config = CASE
        WHEN sub.name = 'parent_business_partner_id'
        THEN '{"target_entity":"business_partner","display_field":"name"}'::jsonb
        ELSE control.entity_field.reference_config
    END
FROM (
    SELECT ef.id,
           f.name,
           f.data_type,
           f.cardinality,
           f.ui_type,
           f.sort_order
    FROM control.entity_field ef
    JOIN control.entity_version ev ON ef.entity_version_id = ev.id
    JOIN control.entity e          ON e.id = ev.entity_id
    JOIN (VALUES
        ('registration_country_code',  'text',       'zero_or_one', 'country'::text,   70),
        ('legal_form',                 'enum',       'zero_or_one', NULL::text,        72),
        ('tax_residence_country_code', 'text',       'zero_or_one', 'country'::text,   75),
        ('parent_business_partner_id', 'uuid',       'zero_or_one', 'reference'::text, 85),
        ('aliases',                    'text_array', 'many',        NULL::text,        100),
        ('tags',                       'jsonb',      'zero_or_one', NULL::text,        110),
        ('business_types',             'text_array', 'many',        NULL::text,        120),
        ('incorporation_date',         'date',       'zero_or_one', NULL::text,        155),
        ('effective_from',             'date',       'zero_or_one', NULL::text,        160),
        ('effective_until',            'date',       'zero_or_one', NULL::text,        165),
        ('metadata',                   'jsonb',      'zero_or_one', NULL::text,        220)
    ) AS f(name, data_type, cardinality, ui_type, sort_order) ON ef.name = f.name
    WHERE e.table_schema = 'master' AND e.table_name = 'business_partner'
      AND e.tenant_id IS NULL AND ev.version_no = 1
) AS sub
WHERE control.entity_field.id = sub.id;

UPDATE control.entity_field ef
SET is_read_only = CASE
    WHEN ef.name IN ('code', 'status', 'metadata') THEN true
    ELSE false
END
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin <> 'system'
  AND ef.is_read_only IS DISTINCT FROM CASE
      WHEN ef.name IN ('code', 'status', 'metadata') THEN true
      ELSE false
  END;

-- BP network links: DDL-backed child tab for provider, connection, verification, and sync state.
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    numbering_active, naming_policy, feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'ACC'),
    'business_partner_network_link', 'BPNL', 'business_partner_network_link',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'business_partner_network_link',
    'Network Link', 'Network Links', 'network', 'indigo',
    false,
    '{}'::jsonb,
    '{"parent_entity":"business_partner","parent_fk":"business_partner_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE entity_code = 'business_partner_network_link'
      AND tenant_id IS NULL
);

INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', NULL::text,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('provider_code',              'provider_code',              'Provider',                  'text',        'one',         true,  true,  '{"max_length":80}'::jsonb,  10),
    ('network_account_code',        'network_account_id',         'Network Account',           'text',        'one',         true,  true,  NULL::jsonb,                 20),
    ('external_party_code',         'external_party_id',          'External Party',            'text',        'zero_or_one', false, true,  NULL::jsonb,                 30),
    ('remote_tenant_id',           'remote_tenant_id',           'Remote Tenant',             'uuid',        'zero_or_one', false, false, NULL::jsonb,                 40),
    ('remote_business_partner_id', 'remote_business_partner_id', 'Remote Business Partner',   'uuid',        'zero_or_one', false, false, NULL::jsonb,                 50),
    ('connection_status',          'connection_status',          'Connection Status',         'text',        'one',         true,  true,  NULL::jsonb,                 60),
    ('verification_status',        'verification_status',        'Verification Status',       'text',        'one',         true,  true,  NULL::jsonb,                 70),
    ('match_confidence',           'match_confidence',           'Match Confidence',          'numeric',     'zero_or_one', false, false, '{"min":0,"max":100}'::jsonb,80),
    ('sync_status',                'sync_status',                'Sync Status',               'text',        'one',         true,  true,  NULL::jsonb,                 90),
    ('last_synced_at',             'last_synced_at',             'Last Synced At',            'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                100),
    ('invited_at',                 'invited_at',                 'Invited At',                'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                110),
    ('connected_at',               'connected_at',               'Connected At',              'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                120),
    ('invitation_expires_at',      'invitation_expires_at',      'Invitation Expires At',     'timestamptz', 'zero_or_one', false, false, NULL::jsonb,                130),
    ('invitation_message',         'invitation_message',         'Invitation Message',        'text',        'zero_or_one', false, false, NULL::jsonb,                140),
    ('network_snapshot',           'network_snapshot',           'Network Snapshot',          'jsonb',       'zero_or_one', false, false, NULL::jsonb,                150),
    ('metadata',                   'metadata',                   'Metadata',                  'jsonb',       'zero_or_one', false, false, NULL::jsonb,                160)
) AS f(name, column_name, label, data_type, cardinality,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity_field ef
SET origin = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id', 'business_partner_id', 'created_by', 'updated_by')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');

UPDATE control.entity_field ef
SET is_read_only = true
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'business_partner_network_link'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.origin <> 'system'
  AND ef.is_read_only IS DISTINCT FROM true;

UPDATE control.entity
SET natural_key_fields = ARRAY['provider_code','network_account_id'],
    display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer', 'master',
        'detail_profile',  'simple',
        'code_field',      'provider_code',
        'title_field',     'network_account_code',
        'subtitle_field',  'connection_status',
        'search_fields',   jsonb_build_array('provider_code','network_account_code','external_party_code'),
        'list_columns',    jsonb_build_array('provider_code','network_account_code','connection_status','verification_status','sync_status'))
WHERE entity_code = 'business_partner_network_link'
  AND tenant_id IS NULL;

-- ── Pin id/tenant_id as system/hidden ─────────────────────────────────────────
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');

-- ── display_config — rich master entity ───────────────────────────────────────
-- Tab order: Overview · Profile · Addresses · Contacts · Tax · Banking · Trust & Compliance · Governance
-- All layout, sections, visibility conditions, and completeness checks live here.
-- No entity-specific logic in the TypeScript runtime.
DO $dc$ DECLARE

    -- ── Tab 1: Overview ───────────────────────────────────────────────────────
    -- KPI facts rail; completeness strip driven by completeness_checks in v_rmc.
    -- Additional Overview sections are metadata-driven so future cards/facts
    -- can be added without TypeScript changes.
    v_tab_overview jsonb := jsonb_build_object(
        'id','__overview','label','Overview','renderer','overview',
        'composite_sections', jsonb_build_array(
            jsonb_build_object(
                'id','__overview_roles','label','Roles','type','child_list',
                'entity_code','business_partner_role_summary',
                'display_fields',jsonb_build_array(
                    'role_label','role_code','role_type','status',
                    'company_scope_count','active_scope_count','blocked_scope_count',
                    'is_payment_ready','is_key_account','risk_rating',
                    'primary_currency_code','open_document_count','ytd_amount','ytd_currency_code'
                ),
                'empty_title','No supplier or customer roles',
                'empty_description','Extend this business partner as a supplier or customer to activate AP or AR processes.',
                'config',jsonb_build_object(
                    'title','role_label',
                    'presentation','profile_cards',
                    'facts',jsonb_build_array('role_code','role_type','company_scope_count','primary_currency_code'),
                    'badges',jsonb_build_array('status'),
                    'defaultSort',jsonb_build_array('display_order:asc'),
                    'presentation_config',jsonb_build_object(
                        'status_field','status',
                        'blocked_field','is_blocked',
                        'code_field','role_code',
                        'title_field','role_label',
                        'primary_fields',jsonb_build_array(
                            jsonb_build_object('field','role_type','label','Type'),
                            jsonb_build_object('field','company_scope_count','label','Company Scopes'),
                            jsonb_build_object('field','active_scope_count','label','Active Scopes'),
                            jsonb_build_object('field','primary_currency_code','label','Currency')
                        ),
                        'secondary_fields',jsonb_build_array(
                            jsonb_build_object('field','blocked_scope_count','label','Blocked Scopes'),
                            jsonb_build_object('field','is_payment_ready','label','Payment Ready'),
                            jsonb_build_object('field','is_key_account','label','Key Account'),
                            jsonb_build_object('field','risk_rating','label','Risk Rating'),
                            jsonb_build_object('field','open_document_count','label','Open Documents'),
                            jsonb_build_object('field','ytd_amount','label','YTD Amount')
                        )
                    )
                )
            )
        )
    );

    -- ── Tab 2: Profile — Identity · Registration · Firmographics · Hierarchy ─
    -- display_fields on each section governs field order and inclusion.
    -- Sections without visibility_condition are always shown.
    v_tab_profile jsonb := jsonb_build_object(
        'id','__profile','label','Profile','renderer','composite',
        'composite_sections', jsonb_build_array(
            jsonb_build_object(
                'id','__profile_identity','label','Identity','type','fields',
                'display_fields', jsonb_build_array(
                    'code','name','display_name','partner_category',
                    'legal_name','legal_form','description','long_description','website_url'
                )),
            jsonb_build_object(
                'id','__profile_registration','label','Registration','type','fields',
                'display_fields', jsonb_build_array(
                    'registration_no','registration_country_code',
                    'tax_residence_country_code','incorporation_date',
                    'effective_from','effective_until','external_ref'
                )),
            jsonb_build_object(
                'id','__profile_firmographics','label','Firmographics','type','fields',
                'display_fields', jsonb_build_array(
                    'founded_year','employee_count_band','annual_revenue_band',
                    'business_types','aliases','tags'
                )),
            jsonb_build_object(
                'id','__profile_hierarchy','label','Hierarchy','type','fields',
                'display_fields', jsonb_build_array(
                    'parent_business_partner_id','metadata'
                ))
        ));

    -- ── Tab 3: Addresses — rich accordion panel (AddressesPanel) ──────────────
    -- renderer=addresses_accordion; owner_type_filter drives the polymorphic query.
    -- No entity_code / display_fields / config needed — panel fetches via
    -- GET /api/master/addresses?owner_type=business_partner&owner_id=<uuid>.
    v_tab_addresses jsonb := jsonb_build_object(
        'id','__addresses','label','Addresses','renderer','addresses_accordion',
        'owner_type_filter','business_partner',
        'add_label','Add address',
        'empty_title','No addresses registered',
        'empty_description','Billing, remittance, shipping, and legal addresses for this business partner.'
    );

    -- ── Tab 4: Contacts ───────────────────────────────────────────────────────
    -- Flat card list: primary contacts first, then alphabetical by name.
    -- contact_role shown as subtitle fact on the card (not grouped — too few contacts
    -- to warrant grouping; use sort-primary-first as the primary discoverability signal).
    -- display_fields doubles as the drawer field whitelist (ordered).
    -- Audit fields (created_at, updated_at) are last and rendered collapsed by the runtime.
    v_tab_contacts jsonb := jsonb_build_object(
        'id','__contacts','label','Contacts','renderer','contacts_channel_accordion',
        'entity_code','business_partner_contact_person',
        'party_type_filter','business_partner',
        'add_label','Add contact',
        'empty_title','No contacts registered',
        'empty_description','Contact persons are managed through the contact registry.');

    -- BP-owned Tax registrations
    v_tab_tax jsonb := jsonb_build_object(
        'id','__tax','label','Tax','renderer','summary_cards_with_drawer',
        'entity_code','business_partner_tax_profile',
        'display_fields',jsonb_build_array(
            'country_code','tax_classification','taxation_type','global_location_number',
            'tax_number','state_tax_number','sales_tax_number','service_tax_number','regional_tax_number','vat_number',
            'is_vat_registered','vat_registration_doc_id',
            'has_tax_clearance','tax_clearance_number','tax_clearance_expiry_date','tax_clearance_doc_id',
            'penalty_information','discount_information',
            'status','created_at','created_by','updated_at','updated_by','status_changed_at','status_changed_by'
        ),
        'add_href_template','/app/business_partner_tax_profile/new?parent_id={uuid}',
        'add_label','Add country profile',
        'empty_title','No tax profiles configured',
        'empty_description','Add per-country tax registrations, VAT/GST/SST/WHT numbers for this business partner.',
        'config',jsonb_build_object(
            'title',      'country_code',
            'facts',      jsonb_build_array('tax_classification','vat_number','tax_clearance_expiry_date'),
            'badges',     jsonb_build_array('status'),
            'alertRules', jsonb_build_array('tax_missing_id'),
            'defaultSort',jsonb_build_array('country_code:asc')
        ));

    -- BP-owned Banking
    v_tab_banking jsonb := jsonb_build_object(
        'id','__banking','label','Banking','renderer','summary_cards_with_drawer',
        'entity_code','business_partner_bank_account',
        'create_entity_code','bank_account',
        'link_entity_code','bank_account_link',
        'link_owner_type','business_partner',
        'display_fields',jsonb_build_array('bank_name','currency_code','account_number','is_verified','is_primary'),
        'add_href_template','/app/bank_account/new?parent_id={uuid}',
        'add_label','Add Bank Account',
        'empty_title','No bank accounts registered',
        'empty_description','Add bank accounts owned by this business partner and used by AP/AR roles.',
        'config',jsonb_build_object(
            'title',      'bank_name',
            'facts',      jsonb_build_array('currency_code','account_number'),
            'badges',     jsonb_build_array('verified','primary'),
            'alertRules', jsonb_build_array('bank_missing_verification','bank_inactive'),
            'defaultSort',jsonb_build_array('is_primary desc','updated_at desc')
        ));

    -- ── Retired: Roles tab — role cards now live on Overview via BP role summary ──
    -- Each section is gated: only shown when the corresponding role entity has
    -- at least one record for this BP. Both sections absent = empty-state message.
    v_tab_roles jsonb := jsonb_build_object(
        'id','__roles','label','Roles','renderer','composite',
        'composite_sections', jsonb_build_array(
            jsonb_build_object(
                'id','__roles_supplier','label','Supplier Role','type','child',
                'entity_code','supplier',
                'display_fields',jsonb_build_array('supplier_code','supplier_type','status'),
                'empty_title','No supplier role assigned',
                'empty_description','This business partner has no AP supplier role.',
                'visibility_condition',jsonb_build_object(
                    'type','child_exists','entity_code','supplier'
                )),
            jsonb_build_object(
                'id','__roles_customer','label','Customer Role','type','child',
                'entity_code','customer',
                'display_fields',jsonb_build_array('customer_code','customer_type','status'),
                'empty_title','No customer role assigned',
                'empty_description','This business partner has no AR customer role.',
                'visibility_condition',jsonb_build_object(
                    'type','child_exists','entity_code','customer'
                ))
        ));

    -- ── Trust & Compliance ────────────────────────────────────────────────────
    -- Composite tab with three child_list sections.
    -- Section order: Certifications (approval blockers) → Identifiers (stable
    -- reference) → Network Accounts (operational state).
    -- Each section is a delegated ChildSummaryCardsPanel; child add/edit is governed
    -- by the section-specific metadata and permissions.
    v_tab_trust jsonb := jsonb_build_object(
        'id','__trust','label','Trust & Compliance','renderer','composite',
        'composite_sections', jsonb_build_array(

            -- Certifications — ISO, ESG, safety, regulatory
            -- through_entity: backend subquery resolves supplier for this BP, then filters
            -- Certifications are BP-owned (owner_type=business_partner).
            jsonb_build_object(
                'id','__trust_certs','label','Certifications','type','child_list',
                'entity_code','business_partner_certification',
                'display_fields',jsonb_build_array(
                    'certification_display_name','certification_category','certification_issuing_body',
                    'certificate_number','certified_by','certified_location',
                    'effective_from','effective_until','status'
                ),
                'empty_title','No certifications on file',
                'empty_description','ISO, ESG, safety, and regulatory certifications are managed through the certification registry.',
                'config',jsonb_build_object(
                    'title',       'certification_display_name',
                    'facts',       jsonb_build_array('certified_by','certificate_number','effective_until'),
                    'badges',      jsonb_build_array('status','expiry'),
                    'alertRules',  jsonb_build_array('cert_expired','cert_expiring_soon'),
                    'defaultSort', jsonb_build_array('effective_until:asc')
                )),

            -- External Identifiers — DUNS, LEI, GLN, PEPPOL
            -- through_entity: backend subquery resolves supplier for this BP, then filters
            -- External identifiers are BP-owned (owner_type=business_partner).
            jsonb_build_object(
                'id','__trust_ids','label','External Identifiers','type','child_list',
                'entity_code','business_partner_identifier',
                'display_fields',jsonb_build_array('scheme','value','valid_until','status'),
                'empty_title','No identifiers registered',
                'empty_description','External IDs (DUNS, LEI, GLN, PEPPOL) are managed through the identifier registry.',
                'config',jsonb_build_object(
                    'title',  'value',
                    'facts',  jsonb_build_array('scheme','valid_until'),
                    'badges', jsonb_build_array('status')
                )),

            -- Network Accounts — Athyper network, PEPPOL, Ariba, etc.
            jsonb_build_object(
                'id','__trust_network','label','Network Accounts','type','child_list',
                'entity_code','business_partner_network_link',
                'display_fields',jsonb_build_array('provider_code','network_account_code','connection_status','verification_status','sync_status'),
                'empty_title','No network accounts registered',
                'empty_description','External network account links and sync state appear here.',
                'config',jsonb_build_object(
                    'title',  'provider_code',
                    'facts',  jsonb_build_array('network_account_code','last_synced_at'),
                    'badges', jsonb_build_array('connection_status','verification_status','sync_status')
                ))
        ));

    -- ── Governance — ownership, control, officers, signatories ────────────────
    -- group_by_field = relation_type drives the grouped BP 360 card view.
    -- through_entity: backend subquery resolves supplier for this BP, then filters
    -- Governance records are BP-owned (party_type=business_partner).
    v_tab_governance jsonb := jsonb_build_object(
        'id','__governance','label','Governance','renderer','summary_cards_with_drawer',
        'entity_code','business_partner_governance',
        'display_fields',jsonb_build_array(
            'member_name','relation_type','member_type','member_business_partner_id',
            'member_country_code','business_title',
            'ownership_pct','voting_pct','beneficial_ownership_pct',
            'directness','control_nature','share_class',
            'authority_scope','authority_limit_amount','authority_limit_currency_code',
            'appointed_date','end_of_term',
            'kyc_status','sanctions_status','pep_status','last_screened_at',
            'evidence_status','source_of_wealth','last_reviewed_at','next_review_at',
            'notes','status'
        ),
        'add_href_template','/app/business_partner_governance/new?parent_id={uuid}',
        'add_label','Add Governance Member',
        'empty_title','No governance structure recorded',
        'empty_description','Shareholders, UBOs, directors, officers, signatories, and authorized representatives are managed through the governance registry.',
        'config',jsonb_build_object(
            'title',          'member_name',
            'facts',          jsonb_build_array(
                'relation_type','ownership_pct','voting_pct','beneficial_ownership_pct',
                'directness','business_title','next_review_at'
            ),
            'badges',         jsonb_build_array('kyc_status','sanctions_status','pep_status','evidence_status','status'),
            'group_by_field', 'relation_type',
            'group_order',    jsonb_build_array(
                'shareholder','ubo','director','board_member','officer',
                'signatory','authorized_representative','company_secretary',
                'auditor','advisor','proxy'
            ),
            'group_labels',   jsonb_build_object(
                'shareholder',              'Shareholders',
                'ubo',                      'Ultimate Beneficial Owners',
                'director',                 'Directors',
                'board_member',             'Board Members',
                'officer',                  'Officers',
                'signatory',                'Signatories',
                'authorized_representative','Authorized Representatives',
                'company_secretary',        'Company Secretaries',
                'auditor',                  'Auditors',
                'advisor',                  'Advisors',
                'proxy',                    'Proxies'
            ),
            'defaultSort',    jsonb_build_array('relation_type:asc','member_name:asc')
        ));

    -- ── master_config — completeness checks + tabs ────────────────────────────
    -- completeness_checks are evaluated in the Overview strip (max 3, severity-ordered).
    -- child_missing checks are defined but skipped until the address entity is registered.
    v_rmc jsonb := jsonb_build_object(
        'type_label',          'BUSINESS PARTNER',
        'classification_field','partner_category',
        'header_facts',        jsonb_build_array('partner_category','registration_country_code','legal_form','employee_count_band'),
        'status_dimensions',   '[]'::jsonb,
        'platform_panels',     jsonb_build_array('comments','attachments','activity'),
        'tabs', jsonb_build_array(
            v_tab_overview,
            v_tab_profile,
            v_tab_addresses,
            v_tab_contacts,
            v_tab_tax,
            v_tab_banking,
            v_tab_trust,
            v_tab_governance
        ),
        'completeness_checks', jsonb_build_array(
            -- Certification expiry warning (90-day look-ahead).
            jsonb_build_object(
                'key',          'cert_expiry',
                'message',      'Certification expires {date}',
                'tab_target',   '__trust',
                'severity',     'warning',
                'check_type',   'child_field_expiry',
                'child_entity', 'business_partner_certification',
                'check_config', jsonb_build_object(
                    'field',          'effective_until',
                    'threshold_days', 90
                )),
            -- Network sync degraded state (pending/drift/error).
            jsonb_build_object(
                'key',          'network_sync_degraded',
                'message',      'Network sync pending',
                'tab_target',   '__trust',
                'severity',     'info',
                'check_type',   'child_any_match',
                'child_entity', 'business_partner_network_link',
                'check_config', jsonb_build_object(
                    'field',  'sync_status',
                    'values', jsonb_build_array('pending','drift','error')
                )),
            -- Missing billing address — gated on customer role, deferred until address entity.
            jsonb_build_object(
                'key',          'missing_billing_address',
                'message',      'Missing billing address',
                'tab_target',   '__addresses',
                'severity',     'blocking',
                'role_gate',    'customer',
                'check_type',   'child_missing',
                'child_entity', 'business_partner_address',
                'check_config', jsonb_build_object('purpose', 'billing')),
            -- Missing remit-to address — gated on supplier role, deferred until address entity.
            jsonb_build_object(
                'key',          'missing_remit_to_address',
                'message',      'Missing remit-to address',
                'tab_target',   '__addresses',
                'severity',     'blocking',
                'role_gate',    'supplier',
                'check_type',   'child_missing',
                'child_entity', 'business_partner_address',
                'check_config', jsonb_build_object('purpose', 'remit_to'))
        )
    );

    v_intake_modes jsonb := jsonb_build_array(
        jsonb_build_object(
            'code',             'supplier',
            'label',            'Supplier',
            'description',      'BP identity with AP role.',
            'icon',             'handshake',
            'href',             '/app/business_partner/new?mode=supplier',
            'flow_entity',      'supplier',
            'flow_code',        'supplier_intake',
            'persistence_mode', 'composite_supplier_intake',
            'sort_order',       10),
        jsonb_build_object(
            'code',             'customer',
            'label',            'Customer',
            'description',      'BP identity with AR role.',
            'icon',             'user-round-plus',
            'href',             '/app/business_partner/new?mode=customer',
            'flow_entity',      'customer',
            'flow_code',        'customer_intake',
            'persistence_mode', 'business_partner_intake',
            'sort_order',       20),
        jsonb_build_object(
            'code',             'extension',
            'label',            'Extension',
            'description',      'Add role or company code.',
            'icon',             'receipt-text',
            'href',             '/app/business_partner/new?mode=extension',
            'flow_entity',      'business_partner',
            'flow_code',        'business_partner_extension',
            'persistence_mode', 'business_partner_extension',
            'sort_order',       30)
    );

    v_base jsonb := jsonb_build_object(
        'detail_renderer',    'master',
        'detail_profile',     'rich',
        'list_renderer',      'table',
        'code_field',         'code',
        'title_field',        'name',
        'subtitle_field',     'legal_name',
        'search_fields',      jsonb_build_array('search_text','code','name','legal_name','registration_no','external_ref','role_codes'),
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'default_sort_order', 'asc',
        'list_columns',       jsonb_build_array('code','name','role_summary','role_codes','registration_country_code','legal_form','status'),
        'compact_card',       jsonb_build_object(
            'bottom_fields',  jsonb_build_array('role_summary','registration_country_code')),
        'intake_modes',       v_intake_modes
    );
BEGIN
    UPDATE control.entity
    SET display_config = v_base || jsonb_build_object('master_config', v_rmc)
    WHERE table_schema = 'master' AND table_name = 'business_partner'
      AND tenant_id IS NULL AND display_config = '{}'::jsonb;

    UPDATE control.entity
    SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
            'detail_renderer',    'master',
            'detail_profile',     'rich',
            'code_field',         'code',
            'title_field',        'name',
            'subtitle_field',     'legal_name',
            'search_fields',      jsonb_build_array('search_text','code','name','legal_name','registration_no','external_ref','role_codes'),
            'default_sort_field', 'name',
            'default_sort_dir',   'asc',
            'default_sort_order', 'asc',
            'list_columns',       jsonb_build_array('code','name','role_summary','role_codes','registration_country_code','legal_form','status'),
            'compact_card',       jsonb_build_object(
                'bottom_fields',  jsonb_build_array('role_summary','registration_country_code')),
            'intake_modes',       v_intake_modes,
            'master_config',   v_rmc)
    WHERE table_schema = 'master' AND table_name = 'business_partner'
      AND tenant_id IS NULL AND display_config != '{}'::jsonb;
END $dc$;

-- Filter drawer metadata. The runtime reads entity.display_config.filter_bar
-- and per-field entity_field.ui_hint->'filter'. Meta Studio can later edit
-- these JSON values without changing the UI runtime.
DO $filters$
DECLARE
    v_ev uuid;
BEGIN
    SELECT ev.id
    INTO v_ev
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.table_schema = 'master'
      AND e.table_name = 'business_partner'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        UPDATE control.entity_field ef
        SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
            || jsonb_build_object(
                'group_key', f.section_key,
                'filter', f.filter_hint
            )
        FROM (VALUES
            ('status', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','facet_multi_select','quick_filter',true,'quick_label','Status','quick_order',30)),
            ('partner_category', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','facet_multi_select','quick_filter',false)),
            ('role_summary', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','facet_multi_select','quick_filter',true,'quick_label','Role','quick_order',25)),
            ('has_supplier_role', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','boolean','quick_filter',false)),
            ('has_customer_role', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','boolean','quick_filter',false)),
            ('is_dual_role', 'status_workflow', jsonb_build_object(
                'section_key','status_workflow','section_label','Status & Workflow','section_order',10,
                'control_type','boolean','quick_filter',false)),
            ('code', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('name', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('registration_no', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('external_ref', 'identification', jsonb_build_object(
                'section_key','identification','section_label','Identification','section_order',20,
                'control_type','text_search','quick_filter',false)),
            ('registration_country_code', 'geography', jsonb_build_object(
                'section_key','geography','section_label','Geography','section_order',30,
                'control_type','facet_multi_select','quick_filter',true,'quick_label','Country','quick_order',50)),
            ('tax_residence_country_code', 'geography', jsonb_build_object(
                'section_key','geography','section_label','Geography','section_order',30,
                'control_type','facet_multi_select','quick_filter',false)),
            ('legal_form', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','facet_multi_select','quick_filter',false)),
            ('founded_year', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','number_range','quick_filter',false)),
            ('employee_count_band', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','facet_multi_select','quick_filter',false)),
            ('annual_revenue_band', 'general', jsonb_build_object(
                'section_key','general','section_label','General','section_order',40,
                'control_type','facet_multi_select','quick_filter',false))
        ) AS f(name, section_key, filter_hint)
        WHERE ef.entity_version_id = v_ev
          AND ef.name = f.name;
    END IF;

    UPDATE control.entity
    SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'filter_bar', jsonb_build_object(
            'quick_filters', jsonb_build_array(
                jsonb_build_object('key','__bookmarked','label','Favourites','value',true,'sort_order',10),
                jsonb_build_object('key','__created_by','label','My documents','value','me','sort_order',20),
                jsonb_build_object('key','role.supplier','field','has_supplier_role','label','Suppliers','value',true,'sort_order',30),
                jsonb_build_object('key','role.customer','field','has_customer_role','label','Customers','value',true,'sort_order',40),
                jsonb_build_object('key','role.dual','field','is_dual_role','label','Dual role','value',true,'sort_order',50),
                jsonb_build_object('key','partner_category.organization','field','partner_category','label','Organizations','value','organization','sort_order',60),
                jsonb_build_object('key','partner_category.internal','field','partner_category','label','Internal BPs','value','internal','sort_order',70)
            ),
            'sections', jsonb_build_array(
                jsonb_build_object('key','status_workflow','label','Status & Workflow','sort_order',10),
                jsonb_build_object('key','identification','label','Identification','sort_order',20),
                jsonb_build_object('key','geography','label','Geography','sort_order',30),
                jsonb_build_object('key','general','label','General','sort_order',40)
            )
        )
    )
    WHERE table_schema = 'master'
      AND table_name = 'business_partner'
      AND tenant_id IS NULL;
END $filters$;

-- ── Correct natural_key_fields + default_sort_field ───────────────────────────
UPDATE control.entity
SET natural_key_fields = ARRAY['code'],
    display_config     = display_config || '{"default_sort_field":"name"}'::jsonb,
    feature_flags      = COALESCE(feature_flags, '{}'::jsonb) || '{
      "is_readonly": false,
      "list_entity_code": "business_partner_app_index",
      "duplicate_check": {
        "hard_gate": true,
        "block_on_exact": true,
        "exact_fields": ["registration_no", "identifier", "tax_number"],
        "strong_name_threshold": 0.85,
        "weak_name_threshold": 0.55,
        "redirect_modes": ["edit_existing", "extend_role", "extend_company_code"]
      },
      "extension_modes": ["supplier_role", "customer_role", "supplier_company_code", "customer_company_code"],
      "ownership_lanes": {
        "identity": ["name", "legal_name", "registration_no", "registration_country_code", "tax_residence_country_code"],
        "supplier": ["supplier_type", "spend_category_id", "payment_term_id", "payment_method_id"],
        "customer": ["customer_type", "is_key_account", "risk_rating"],
        "finance_ap": ["company_code_supplier_profile"],
        "finance_ar": ["company_code_customer_profile"]
      }
    }'::jsonb
WHERE table_schema = 'master' AND table_name = 'business_partner'
  AND tenant_id IS NULL
  AND (natural_key_fields != ARRAY['code']
       OR display_config->>'default_sort_field' IS DISTINCT FROM 'name'
       OR feature_flags->>'is_readonly' IS DISTINCT FROM 'false'
       OR feature_flags->'duplicate_check' IS NULL
       OR feature_flags->'extension_modes' IS NULL);
