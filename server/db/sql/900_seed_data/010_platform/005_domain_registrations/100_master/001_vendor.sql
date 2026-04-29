-- 100_master/001_vendor.sql
-- Purpose: control.entity + entity_version + entity_field for Supplier (master.supplier)
-- Module: BUY (Buying)
-- Canonical term: "supplier" — matches table name master.supplier throughout
-- Depends on: LookupDomain/master/supplier_type.sql
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize any prior seeding as 'vendor' → 'supplier' ──────────────────
-- Runs unconditionally — safe to re-run; fixes existing DBs with stale labels.
UPDATE control.entity
SET name           = 'supplier',
    entity_code    = 'supplier',
    entity_short   = 'SUP',
    label_singular = 'Supplier',
    label_plural   = 'Suppliers'
WHERE table_schema = 'master' AND table_name = 'supplier'
  AND tenant_id IS NULL;

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
    'supplier', 'SUP', 'supplier',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'supplier',
    'Supplier', 'Suppliers', 'building-2', 'blue',
    true,
    '{"prefix":"SUP","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":false,"party_category":"supplier","allow_address":true,"allow_contact":true}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.entity
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL
);

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'supplier'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field ──────────────────────────────────────────────────
-- Naming rules enforced by DB constraints:
--   ef_id_suffix_chk  : name ending _id → data_type must be uuid/reference/uuid[]
--   ef_bool_naming_chk: boolean → name must start with is_/has_/can_/allow_/enable_
--   ef_cardinality_chk: only 'one', 'many', 'zero_or_one' allowed
-- tax_id column → field name 'tax_number' (column_name stays 'tax_id')
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
    ('code',                     'code',                     'Supplier Code',    'text',          'one',         NULL::text,                   true,  true,  '{"max_length":20}'::jsonb,  10),
    ('name',                     'name',                     'Supplier Name',    'text',          'one',         NULL::text,                   true,  true,  '{"max_length":255}'::jsonb, 20),
    ('display_name',             'display_name',             'Display Name',     'text',          'zero_or_one', NULL::text,                   false, false, '{"max_length":255}'::jsonb, 25),
    ('legal_name',               'legal_name',               'Legal Name',       'text',          'zero_or_one', NULL::text,                   false, false, '{"max_length":255}'::jsonb, 30),
    ('supplier_type',            'supplier_type',            'Supplier Type',    'enum',          'zero_or_one', 'master.supplier_type'::text,       false, true,  NULL::jsonb,                 40),
    ('legal_form',               'legal_form',               'Legal Form',       'enum',          'zero_or_one', 'master.supplier_legal_form'::text, false, true,  NULL::jsonb,                 45),
    ('status',                   'status',                   'Status',           'lifecycle_state','one',         NULL::text,                         true,  true,  NULL::jsonb,                 50),
    ('tax_number',               'tax_id',                   'Primary Tax ID',   'text',          'zero_or_one', NULL::text,                   false, false, '{"max_length":50}'::jsonb,  60),
    ('description',              'description',              'Description',      'text',          'zero_or_one', NULL::text,                   false, false, '{"max_length":500}'::jsonb, 70),
    ('website_url',              'website_url',              'Website',          'text',          'zero_or_one', NULL::text,                   false, false, NULL::jsonb,                 80),
    ('registration_no',          'registration_no',          'Registration No.', 'text',          'zero_or_one', NULL::text,                   false, true,  NULL::jsonb,                 90),
    ('registration_country_code','registration_country_code','Reg. Country',     'text',          'zero_or_one', NULL::text,                   false, true,  NULL::jsonb,                100),
    ('external_ref',             'external_ref',             'External Ref',     'text',          'zero_or_one', NULL::text,                   false, false, NULL::jsonb,                110)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 4. Set ui_type for country picker ────────────────────────────────────────
-- Tells the EntityForm field-renderer registry to use CountryPicker (AsyncCombobox
-- backed by shared.country lookup domain) instead of a plain text input.
UPDATE control.entity_field ef
SET ui_type = 'country'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'registration_country_code'
  AND ef.ui_type IS DISTINCT FROM 'country';

-- ── 5. Deactivate stale fields ────────────────────────────────────────────────
UPDATE control.entity_field ef
SET is_active = false
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('payment_terms', 'payment_method', 'currency_code',
                  'credit_limit', 'contact_email', 'contact_phone',
                  'vendor_type', 'tax_id');

-- ── 6. display_config — rich_master renderer + list/search + tab config ──────
-- All supplier-specific layout decisions live here in SQL.
-- Adding a new master entity with rich tabs = SQL only, zero new TSX files.

-- ── Supplier 360 tab design (locked April 2026) ───────────────────────────────
-- 8 domain tabs: Overview · Profile · Coverage · Tax · Banking · Certifications · Standing · Governance
-- 3 platform icons in tab bar (not tabs): Comments · Attachments · Activity
-- Profile  → composite (Basic Details / Identifiers / Addresses / Contacts)
-- Standing → composite (Qualification / Blocks & Holds)
DO $dc$ DECLARE
    v_tabs jsonb := jsonb_build_array(

        -- 1. Overview
        jsonb_build_object('id','__overview','label','Overview','renderer','overview'),

        -- 2. Profile — composite: Basic Details + Identifiers + Addresses + Contacts
        jsonb_build_object('id','__profile','label','Profile','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__profile_details','label','Basic Details','type','fields'),
                jsonb_build_object('id','__profile_identifiers','label','Identifiers','type','child',
                    'entity_code','supplier_identifier',
                    'display_fields',jsonb_build_array('scheme','value','is_primary','is_verified'),
                    'add_href_template','/app/supplier_identifier/new?parent_id={uuid}',
                    'add_label','Add Identifier',
                    'empty_title','No identifiers registered',
                    'empty_description','Add external IDs such as DUNS, LEI, GLN, PEPPOL, or Ariba.'),
                jsonb_build_object('id','__profile_addresses','label','Addresses','type','child',
                    'entity_code','address',
                    'display_fields',jsonb_build_array('address_line_1','city','country_code'),
                    'add_href_template','/app/address/new?parent_id={uuid}',
                    'add_label','Add Address',
                    'empty_title','No addresses registered',
                    'empty_description','Add registered, billing, and shipping addresses.'),
                jsonb_build_object('id','__profile_contacts','label','Contacts','type','child',
                    'entity_code','supplier_contact_person',
                    'display_fields',jsonb_build_array('contact_name','business_title','is_primary'),
                    'add_href_template','/app/supplier_contact_person/new?parent_id={uuid}',
                    'add_label','Add Contact',
                    'empty_title','No contacts registered',
                    'empty_description','Add account managers, technical contacts, and escalation contacts.')
            )),

        -- 3. Coverage — geographic/service coverage
        jsonb_build_object('id','__coverage','label','Coverage','renderer','child',
            'entity_code','supplier_service_coverage',
            'display_fields',jsonb_build_array('coverage_level','coverage_type','country_code'),
            'add_href_template','/app/supplier_service_coverage/new?parent_id={uuid}',
            'add_label','Add Coverage',
            'empty_title','No service coverage defined',
            'empty_description','Define where this supplier can ship or deliver services.'),

        -- 4. Tax — per-country tax registrations
        jsonb_build_object('id','__tax','label','Tax','renderer','child',
            'entity_code','supplier_tax_profile',
            'display_fields',jsonb_build_array('country_code','taxation_type','tax_number'),
            'add_href_template','/app/supplier_tax_profile/new?parent_id={uuid}',
            'add_label','Add Tax Profile',
            'empty_title','No tax profiles configured',
            'empty_description','Add per-country tax registrations, VAT/GST/SST/WHT numbers.'),

        -- 5. Banking — remittance bank accounts
        -- entity_code points at the view (v_supplier_bank_account) for listing via parent_fk=supplier_id.
        -- create_entity_code + link_entity_code drive the two-step create in ChildEntityPanel:
        --   Step 1: POST /api/records/bank_account     (creates the physical bank account)
        --   Step 2: POST /api/records/bank_account_link (creates owner_type=supplier link)
        jsonb_build_object('id','__banking','label','Banking','renderer','child',
            'entity_code','supplier_bank_account',
            'create_entity_code','bank_account',
            'link_entity_code','bank_account_link',
            'link_owner_type','supplier',
            'display_fields',jsonb_build_array('bank_name','account_number','currency_code'),
            'add_href_template','/app/bank_account/new?parent_id={uuid}',
            'add_label','Add Bank Account',
            'empty_title','No bank accounts registered',
            'empty_description','Add bank accounts used for AP payment remittances.'),

        -- 6. Certifications — ISO, Halal, ESG, safety, statutory
        jsonb_build_object('id','__certifications','label','Certifications','renderer','child',
            'entity_code','supplier_certification',
            'display_fields',jsonb_build_array('custom_name','certificate_number','effective_until'),
            'add_href_template','/app/supplier_certification/new?parent_id={uuid}',
            'add_label','Add Certification',
            'empty_title','No certifications on file',
            'empty_description','Add ISO, Halal, ESG, safety, or regulatory certifications.'),

        -- 7. Standing — composite: Qualification + Blocks & Holds
        jsonb_build_object('id','__standing','label','Standing','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__standing_qualification','label','Qualification','type','child',
                    'entity_code','supplier_qualification',
                    'display_fields',jsonb_build_array('onboarding_status','is_approved_supplier','risk_tier'),
                    'empty_title','No qualification record',
                    'empty_description','A qualification record is created when the supplier is reviewed.'),
                jsonb_build_object('id','__standing_blocks','label','Blocks & Holds','type','child',
                    'entity_code','supplier_block',
                    'display_fields',jsonb_build_array('block_type','block_reason','is_active'),
                    'add_href_template','/app/supplier_block/new?parent_id={uuid}',
                    'add_label','Add Block',
                    'empty_title','No active blocks',
                    'empty_description','Procurement, invoice, and payment blocks appear here.')
            )),

        -- 8. Governance — shareholders, UBOs, directors, signatories
        jsonb_build_object('id','__governance','label','Governance','renderer','child',
            'entity_code','supplier_governance',
            'display_fields',jsonb_build_array('relation_type','member_name','ownership_pct'),
            'add_href_template','/app/supplier_governance/new?parent_id={uuid}',
            'add_label','Add Relation',
            'empty_title','No governance structure recorded',
            'empty_description','Add shareholders, UBOs, directors, signatories, and related parties.')

        -- Comments / Attachments / Activity are NOT tabs — they are platform_panels
    );
    v_rmc jsonb := jsonb_build_object(
        'type_label',          'SUPPLIER',
        'classification_field','supplier_type',
        'header_facts',        jsonb_build_array('supplier_type','registration_country_code','legal_form','registration_no','tax_number','created_at'),
        'platform_panels',     jsonb_build_array('comments','attachments','activity'),
        'tabs',                v_tabs
    );
    v_base jsonb := jsonb_build_object(
        'detail_renderer', 'rich_master',
        'list_renderer',   'table',
        'title_field',     'name',
        'subtitle_field',  'legal_name',
        'search_fields',   jsonb_build_array('code','name','legal_name','tax_id','registration_no'),
        'list_columns',    jsonb_build_array('code','name','supplier_type','status','registration_country_code')
    );
BEGIN
    -- Fresh DB: set full config
    UPDATE control.entity
    SET display_config = v_base || jsonb_build_object('rich_master_config', v_rmc)
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL AND display_config = '{}'::jsonb;

    -- Already-seeded DB: patch to rich_master + always overwrite rich_master_config.
    -- No IS DISTINCT guard — re-running is safe and ensures stale type_label/tabs are corrected.
    UPDATE control.entity
    SET display_config = jsonb_set(
            jsonb_set(display_config, '{detail_renderer}', '"rich_master"'),
            '{rich_master_config}', v_rmc)
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL
      AND display_config != '{}'::jsonb;
END $dc$;
