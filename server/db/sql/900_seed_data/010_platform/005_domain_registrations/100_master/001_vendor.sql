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
    '{"is_approvable":false,"party_category":"supplier","allow_address":true,"allow_contact":true,"identity_via":"business_partner","list_entity_code":"supplier_app_index"}'::jsonb,
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

-- ── 2b. Remove stale field registrations from pre-BP-first schema ────────────
-- Identity columns (code, name, legal_name, etc.) moved to master.business_partner.
DELETE FROM control.entity_field ef
USING control.entity_version ev,
      control.entity e
WHERE ef.entity_version_id = ev.id
  AND e.id = ev.entity_id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('code', 'name', 'display_name', 'legal_name', 'legal_form',
                  'tax_number', 'description', 'website_url', 'registration_no',
                  'registration_country_code', 'external_ref', 'long_description',
                  'aliases', 'tags', 'business_types', 'founded_year',
                  'employee_count_band', 'annual_revenue_band');

-- ── 3. control.entity_field — thin AP role fields ─────────────────────────────
-- BP-first: identity fields live on master.business_partner.
-- Supplier-role fields are: type, AP defaults, spend classification, status.
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
    ('supplier_code',  'supplier_code',  'Supplier Code',  'text',           'one',         NULL::text,                          true,  true,  '{"max_length":30}'::jsonb,  10),
    ('supplier_type',  'supplier_type',  'Supplier Type',  'enum',           'zero_or_one', 'master.supplier_type'::text,        false, true,  NULL::jsonb,                 20),
    ('status',         'status',         'Status',         'lifecycle_state','one',         NULL::text,                          true,  true,  NULL::jsonb,                 30)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── 3b. BP-sourced identity fields (origin='system', read-only in edit mode) ──
-- These fields live on master.business_partner but are merged into the detail
-- data response by the BP identity merge in records.route.ts.  Registering them
-- here gives the Profile tab renderer the label / data_type it needs to display
-- them.  column_name matches the key that the merge puts in data{}.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'system', f.enum_domain_code,
       false, false,
       NULL::jsonb, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('name',                      'name',                      'Trading Name',           'text',    'zero_or_one', NULL::text,                100),
    ('display_name',              'display_name',              'Display Name',           'text',    'zero_or_one', NULL::text,                110),
    ('legal_name',                'legal_name',                'Legal Name',             'text',    'zero_or_one', NULL::text,                120),
    ('legal_form',                'legal_form',                'Legal Form',             'enum',    'zero_or_one', 'master.legal_form'::text, 130),
    ('registration_country_code', 'registration_country_code', 'Country of Registration','text',    'zero_or_one', NULL::text,                140),
    ('registration_no',           'registration_no',           'Registration No.',       'text',    'zero_or_one', NULL::text,                150),
    ('tax_residence_country_code','tax_residence_country_code','Tax Residence Country',  'text',    'zero_or_one', NULL::text,                160),
    ('external_ref',              'external_ref',              'External Ref',           'text',    'zero_or_one', NULL::text,                170),
    ('website_url',               'website_url',               'Website',                'text',    'zero_or_one', NULL::text,                200),
    ('description',               'description',               'Description',            'text',    'zero_or_one', NULL::text,                210),
    ('long_description',          'long_description',          'Long Description',       'text',    'zero_or_one', NULL::text,                220),
    ('business_types',            'business_types',            'Business Types',         'text[]',  'zero_or_one', NULL::text,                230),
    ('aliases',                   'aliases',                   'Aliases',                'text[]',  'zero_or_one', NULL::text,                240),
    ('founded_year',              'founded_year',              'Founded Year',           'integer', 'zero_or_one', NULL::text,                250),
    ('employee_count_band',       'employee_count_band',       'Employee Count Band',    'text',    'zero_or_one', NULL::text,                260),
    ('annual_revenue_band',       'annual_revenue_band',       'Annual Revenue Band',    'text',    'zero_or_one', NULL::text,                270)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code, sort_order)
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
  AND ef.name IN ('registration_country_code', 'tax_residence_country_code')
  AND ef.ui_type IS DISTINCT FROM 'country';

UPDATE control.entity_field ef
SET data_type = 'enum',
    enum_domain_code = 'master.legal_form'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'legal_form'
  AND (ef.data_type IS DISTINCT FROM 'enum'
       OR ef.enum_domain_code IS DISTINCT FROM 'master.legal_form');

-- Supplier profile groups: keep Profile business-readable and avoid duplicating
-- data that is now surfaced in the header or dedicated child tabs.
INSERT INTO control.field_group (group_key, label, description, applies_to_classes, sort_order)
VALUES
    ('supplier_core_identity',   'Core Identity',   'Supplier legal and display identity fields.', ARRAY['MASTER'], 110),
    ('supplier_registration',    'Registration',    'Supplier registration jurisdiction and references.', ARRAY['MASTER'], 120),
    ('supplier_classification',  'Classification',  'Supplier classifications used for sourcing and segmentation.', ARRAY['MASTER'], 130),
    ('supplier_company_profile', 'Company Profile', 'Company size and public profile fields.', ARRAY['MASTER'], 140),
    ('supplier_descriptions',    'Description',     'Short and long business descriptions.', ARRAY['MASTER'], 150)
ON CONFLICT (group_key) DO UPDATE
SET label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order;

UPDATE control.entity_field ef
SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', g.group_key)
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    -- supplier_core_identity: brand/identity display fields
    ('name',                      'supplier_core_identity'),
    ('display_name',              'supplier_core_identity'),
    ('legal_name',                'supplier_core_identity'),
    ('supplier_type',             'supplier_core_identity'),
    ('status',                    'supplier_core_identity'),
    -- supplier_registration: legal jurisdiction + cross-references
    ('legal_form',                'supplier_registration'),
    ('registration_country_code', 'supplier_registration'),
    ('registration_no',           'supplier_registration'),
    ('tax_residence_country_code','supplier_registration'),
    ('external_ref',              'supplier_registration'),
    -- supplier_classification: sourcing / segmentation
    ('business_types',            'supplier_classification'),
    ('aliases',                   'supplier_classification'),
    -- supplier_company_profile: size and public-profile data
    ('founded_year',              'supplier_company_profile'),
    ('employee_count_band',       'supplier_company_profile'),
    ('annual_revenue_band',       'supplier_company_profile'),
    ('website_url',               'supplier_company_profile'),
    -- supplier_descriptions: narrative fields
    ('description',               'supplier_descriptions'),
    ('long_description',          'supplier_descriptions')
) AS g(field_name, group_key)
WHERE ef.entity_version_id = ev.id
  AND g.field_name = ef.name
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1;

-- ── Pin id/tenant_id as system/hidden ─────────────────────────────────────────
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');

-- Normalize role profile field metadata after legacy 004_entity_engine seeds.
-- Older installs may already have these rows from 035_version_fields with
-- missing enum/reference targets, which makes the Supplier Role dropdowns empty.
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, enum_domain_code, reference_config,
    is_required, is_filterable, is_read_only, validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, 'standard', f.enum_domain_code, f.reference_config,
       f.is_required, f.is_filterable, f.is_read_only, f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('spend_category_id', 'spend_category_id', 'Spend Category',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 40),
    ('payment_term_id',   'payment_term_id',   'Payment Terms',   'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_term","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 50),
    ('payment_method_id', 'payment_method_id', 'Payment Method',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_method","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 60),
    ('supplier_code',     'supplier_code',     'Supplier Code',   'text', NULL::text,   'one',         NULL::text, NULL::jsonb,                                                                 false, true,  true,  '{"max_length":30}'::jsonb, 10),
    ('supplier_type',     'supplier_type',     'Supplier Type',   'enum', 'select',     'zero_or_one', 'master.supplier_type'::text, NULL::jsonb,                                                      false, true,  true,  NULL::jsonb, 20)
) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code,
       reference_config, is_required, is_filterable, is_read_only, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity_field ef
SET label            = f.label,
    data_type        = f.data_type,
    ui_type          = f.ui_type,
    cardinality      = f.cardinality,
    origin           = 'standard',
    enum_domain_code = f.enum_domain_code,
    enum_config      = CASE WHEN f.enum_domain_code IS NOT NULL THEN NULL ELSE ef.enum_config END,
    reference_config = f.reference_config,
    is_required      = f.is_required,
    is_filterable    = f.is_filterable,
    is_read_only     = f.is_read_only,
    validation       = f.validation,
    sort_order       = f.sort_order
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('spend_category_id', 'spend_category_id', 'Spend Category',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 40),
    ('payment_term_id',   'payment_term_id',   'Payment Terms',   'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_term","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 50),
    ('payment_method_id', 'payment_method_id', 'Payment Method',  'uuid', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_method","target_field":"id","display_field":"name","picker":{"code_field":"code","description_field":"description","navigation_field":"code","show_code":true,"show_description":true,"show_view_action":true}}'::jsonb, false, true,  false, NULL::jsonb, 60),
    ('supplier_code',     'supplier_code',     'Supplier Code',   'text', NULL::text,   'one',         NULL::text, NULL::jsonb,                                                                 false, true,  true,  '{"max_length":30}'::jsonb, 10),
    ('supplier_type',     'supplier_type',     'Supplier Type',   'enum', 'select',     'zero_or_one', 'master.supplier_type'::text, NULL::jsonb,                                                      false, true,  true,  NULL::jsonb, 20)
) AS f(name, column_name, label, data_type, ui_type, cardinality, enum_domain_code,
       reference_config, is_required, is_filterable, is_read_only, validation, sort_order)
WHERE ef.entity_version_id = ev.id
  AND ef.name = f.name
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1;

-- ── 6. display_config — master renderer (detail_profile:rich) + list/search + tab config ──
-- All supplier-specific layout decisions live here in SQL.
-- Adding a new master entity with rich tabs = SQL only, zero new TSX files.

-- ── Supplier role tab design (locked April 2026) ─────────────────────────────
-- 3 role tabs: Overview · Supplier Role · Standing
-- 3 platform icons in tab bar (not tabs): Comments · Attachments · Activity
-- Shared party data lives on Business Partner.
-- Standing → composite (Qualification / Blocks & Holds)
DO $dc$ DECLARE
    v_tabs jsonb := jsonb_build_array(

        -- 1. Overview
        jsonb_build_object('id','__overview','label','Overview','renderer','overview'),

        -- 2. Supplier Role - AP/procurement role lens only.
        -- Legal identity, contacts, tax, banking, coverage, certifications, and
        -- governance live on the parent Business Partner page.
        jsonb_build_object('id','__profile','label','Supplier Role','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__profile_role','label','Role Profile','type','fields',
                    'display_fields',jsonb_build_array(
                        'spend_category_id',
                        'payment_term_id','payment_method_id','is_payment_ready',
                        'payment_ready_at','payment_ready_reason','status'
                    )),
                jsonb_build_object('id','__profile_spend_categories','label','Spend Categories','type','child_list',
                    'entity_code','supplier_spend_category',
                    'display_fields',jsonb_build_array('spend_category_id','is_primary','effective_from','effective_until','status'),
                    'add_href_template','/app/supplier_spend_category/new?parent_id={uuid}',
                    'add_label','Add Category',
                    'empty_title','No spend categories',
                    'empty_description','Supplier category memberships appear here.',
                    'config',jsonb_build_object(
                        'title','spend_category_id',
                        'facts',jsonb_build_array('effective_from','effective_until'),
                        'badges',jsonb_build_array('primary','status','expiry'),
                        'defaultSort',jsonb_build_array('is_primary:desc','status:asc')
                    ))
            )),

        -- 3. Standing - composite: Qualification + Blocks & Holds
        jsonb_build_object('id','__standing','label','Standing','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__standing_qualification','label','Qualification','type','child_list',
                    'entity_code','supplier_qualification',
                    'display_fields',jsonb_build_array(
                        'onboarding_status','profile_completeness_pct','is_approved_supplier','is_preferred_supplier',
                        'is_blocked','block_reason','risk_tier','sanctions_status','aml_kyc_status',
                        'delivery_score','quality_score','sla_score','sourcing_event_count','bid_count','awarded_count',
                        'score_period_start','score_period_end','last_review_date','next_review_date','reviewed_by','status'
                    ),
                    'empty_title','No qualification record',
                    'empty_description','A qualification record is created when the supplier is reviewed.',
                    'config',jsonb_build_object(
                        'title','onboarding_status',
                        'facts',jsonb_build_array('profile_completeness_pct','risk_tier','sanctions_status','aml_kyc_status','next_review_date'),
                        'badges',jsonb_build_array('status'),
                        'presentation','scorecard',
                        'presentation_config',jsonb_build_object(
                            'labels',jsonb_build_object(
                                'onboarding_status','Onboarding',
                                'profile_completeness_pct','Profile complete',
                                'risk_tier','Risk tier',
                                'sanctions_status','Sanctions',
                                'aml_kyc_status','AML / KYC',
                                'next_review_date','Next review',
                                'last_review_date','Last review',
                                'sourcing_event_count','Sourcing events',
                                'bid_count','Bids submitted',
                                'awarded_count','Awarded'
                            ),
                            'tiles',jsonb_build_array(
                                jsonb_build_object('field','onboarding_status','label','Onboarding','meter_field','profile_completeness_pct','helper_fields',jsonb_build_array('profile_completeness_pct')),
                                jsonb_build_object('field','risk_tier','label','Risk tier'),
                                jsonb_build_object('field','sanctions_status','label','Compliance','badge_fields',jsonb_build_array('sanctions_status','aml_kyc_status')),
                                jsonb_build_object('field','next_review_date','label','Next review','helper_fields',jsonb_build_array('last_review_date','reviewed_by'))
                            ),
                            'score_fields',jsonb_build_array('delivery_score','quality_score','sla_score'),
                            'stat_fields',jsonb_build_array('sourcing_event_count','bid_count','awarded_count'),
                            'review_fields',jsonb_build_array('is_approved_supplier','is_preferred_supplier','last_review_date','next_review_date')
                        ),
                        'defaultSort',jsonb_build_array('updated_at:desc')
                    )),
                jsonb_build_object('id','__standing_blocks','label','Blocks & Holds','type','child_list',
                    'entity_code','supplier_block',
                    'display_fields',jsonb_build_array('block_type','block_reason','blocked_at','is_active','lifted_at','lift_reason','notes','status'),
                    'add_href_template','/app/supplier_block/new?parent_id={uuid}',
                    'add_label','Add Block',
                    'empty_title','No active blocks',
                    'empty_description','Procurement, invoice, and payment blocks appear here.',
                    'config',jsonb_build_object(
                        'title','block_type',
                        'facts',jsonb_build_array('block_reason','blocked_at','lifted_at'),
                        'badges',jsonb_build_array('status'),
                        'presentation','timeline',
                        'presentation_config',jsonb_build_object(
                            'title_field','block_type',
                            'description_field','block_reason',
                            'start_field','blocked_at',
                            'end_field','lifted_at',
                            'active_field','is_active',
                            'status_field','status',
                            'active_action_label','Open details',
                            'labels',jsonb_build_object(
                                'block_type','Block type',
                                'block_reason','Reason',
                                'blocked_at','Blocked',
                                'lifted_at','Lifted',
                                'lift_reason','Lift reason'
                            )
                        ),
                        'defaultSort',jsonb_build_array('blocked_at:desc')
                    ))
            )),

        -- 4. Company Codes - AP settings and procurement policies per company.
        jsonb_build_object('id','__company_codes','label','Company Codes','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__company_profiles','label','AP Profiles','type','child_list',
                    'entity_code','company_code_supplier_profile',
                    'display_fields',jsonb_build_array(
                        'company_code_id','currency_code','payment_term_id','payment_method_id',
                        'preferred_remittance_bank_link_id','default_accounting_profile_id',
                        'tax_group_id','default_wht_tax_group_id','invoice_hold_policy_id',
                        'is_blocked','block_reason','status'
                    ),
                    'add_href_template','/app/company_code_supplier_profile/new?parent_id={uuid}',
                    'add_label','Add Profile',
                    'empty_title','No company profiles',
                    'empty_description','Per-company AP settings appear here.',
                    'config',jsonb_build_object(
                        'title','company_code_id',
                        'facts',jsonb_build_array('currency_code','payment_term_id','payment_method_id','tax_group_id','default_wht_tax_group_id'),
                        'badges',jsonb_build_array('status'),
                        'presentation','profile_cards',
                        'presentation_config',jsonb_build_object(
                            'code_field','company_code_id',
                            'title_field','company_code_id',
                            'status_field','status',
                            'blocked_field','is_blocked',
                            'references',jsonb_build_object(
                                'company_code_id',jsonb_build_object('target_entity','company_code','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)),
                                'payment_term_id',jsonb_build_object('target_entity','payment_term','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)),
                                'payment_method_id',jsonb_build_object('target_entity','payment_method','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)),
                                'preferred_remittance_bank_link_id',jsonb_build_object('target_entity','business_partner_bank_account','target_field','id','display_field','bank_name','picker',jsonb_build_object('code_field','account_id_value_masked','show_code',true)),
                                'default_accounting_profile_id',jsonb_build_object('target_entity','accounting_profile','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)),
                                'tax_group_id',jsonb_build_object('target_entity','tax_group','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true)),
                                'default_wht_tax_group_id',jsonb_build_object('target_entity','tax_group','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                            ),
                            'primary_fields',jsonb_build_array(
                                jsonb_build_object('field','currency_code','label','Currency','kind','code'),
                                jsonb_build_object('field','payment_term_id','label','Payment terms'),
                                jsonb_build_object('field','payment_method_id','label','Payment method'),
                                jsonb_build_object('field','preferred_remittance_bank_link_id','label','Remit bank'),
                                jsonb_build_object('field','tax_group_id','label','Tax group'),
                                jsonb_build_object('field','default_wht_tax_group_id','label','WHT')
                            ),
                            'secondary_fields',jsonb_build_array('default_accounting_profile_id','invoice_hold_policy_id','block_reason')
                        ),
                        'defaultSort',jsonb_build_array('created_at:desc')
                    )),
                jsonb_build_object('id','__company_spend_policies','label','Spend Policies','type','child_list',
                    'entity_code','company_code_supplier_spend_policy',
                    'through_entity','company_code_supplier_profile',
                    'display_fields',jsonb_build_array(
                        'supplier_profile_id','spend_category_id','mapping_mode',
                        'sourcing_status','qualification_status','po_status','invoice_status',
                        'valid_from','valid_until','max_po_amount','max_po_currency_code',
                        'is_preferred_supplier','notes','status'
                    ),
                    'empty_title','No spend policies',
                    'empty_description','Company-specific spend eligibility appears here.',
                    'config',jsonb_build_object(
                        'title','spend_category_id',
                        'facts',jsonb_build_array('mapping_mode','sourcing_status','qualification_status','po_status','invoice_status','valid_from','valid_until','max_po_amount'),
                        'badges',jsonb_build_array('status','expiry'),
                        'presentation','policy_matrix',
                        'presentation_config',jsonb_build_object(
                            'filter_field','supplier_profile_id',
                            'references',jsonb_build_object(
                                'supplier_profile_id',jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id'),
                                'spend_category_id',jsonb_build_object('target_entity','spend_category','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                            ),
                            'columns',jsonb_build_array(
                                jsonb_build_object('field','spend_category_id','label','Category'),
                                jsonb_build_object('field','mapping_mode','label','Mapping'),
                                jsonb_build_object('field','sourcing_status','label','Sourcing','kind','status'),
                                jsonb_build_object('field','qualification_status','label','Qualification','kind','status'),
                                jsonb_build_object('field','po_status','label','PO','kind','status'),
                                jsonb_build_object('field','invoice_status','label','Invoice','kind','status'),
                                jsonb_build_object('field','valid_from','label','Valid from'),
                                jsonb_build_object('field','valid_until','label','Valid until'),
                                jsonb_build_object('field','max_po_amount','label','Max PO')
                            ),
                            'labels',jsonb_build_object(
                                'supplier_profile_id','Company profile',
                                'max_po_currency_code','Max PO currency',
                                'is_preferred_supplier','Preferred'
                            )
                        ),
                        'defaultSort',jsonb_build_array('status:asc','valid_until:asc')
                    )),
                jsonb_build_object('id','__company_intent_policies','label','Intent Policies','type','child_list',
                    'entity_code','company_code_supplier_intent_policy',
                    'through_entity','company_code_supplier_profile',
                    'display_fields',jsonb_build_array('supplier_profile_id','business_intent_id','mapping_mode','is_default','is_sourcing_allowed','is_po_allowed','is_invoice_allowed','status'),
                    'empty_title','No intent policies',
                    'empty_description','Buying intent controls appear here.',
                    'config',jsonb_build_object(
                        'title','business_intent_id',
                        'facts',jsonb_build_array('mapping_mode','is_default','is_sourcing_allowed','is_po_allowed','is_invoice_allowed'),
                        'badges',jsonb_build_array('status'),
                        'presentation','ability_cards',
                        'presentation_config',jsonb_build_object(
                            'filter_field','supplier_profile_id',
                            'references',jsonb_build_object(
                                'supplier_profile_id',jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id'),
                                'business_intent_id',jsonb_build_object('target_entity','business_intent','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                            ),
                            'title_field','business_intent_id',
                            'mode_field','mapping_mode',
                            'default_field','is_default',
                            'capability_fields',jsonb_build_array(
                                jsonb_build_object('field','is_sourcing_allowed','label','Sourcing'),
                                jsonb_build_object('field','is_po_allowed','label','PO'),
                                jsonb_build_object('field','is_invoice_allowed','label','Invoice')
                            ),
                            'labels',jsonb_build_object(
                                'business_intent_id','Business intent',
                                'supplier_profile_id','Company profile',
                                'mapping_mode','Mapping'
                            )
                        ),
                        'defaultSort',jsonb_build_array('is_default:desc','status:asc')
                    )),
                jsonb_build_object('id','__company_posting_overrides','label','Posting Overrides','type','child_list',
                    'entity_code','company_code_supplier_posting_override',
                    'through_entity','company_code_supplier_profile',
                    'display_fields',jsonb_build_array('supplier_profile_id','posting_role_code','gl_account_id','book_code','effective_from','effective_to','reason','status'),
                    'empty_title','No posting overrides',
                    'empty_description','AP posting exceptions appear here.',
                    'config',jsonb_build_object(
                        'title','posting_role_code',
                        'facts',jsonb_build_array('gl_account_id','book_code','effective_from','effective_to','reason'),
                        'badges',jsonb_build_array('status'),
                        'presentation','temporal_rules',
                        'presentation_config',jsonb_build_object(
                            'filter_field','book_code',
                            'role_field','posting_role_code',
                            'target_field','gl_account_id',
                            'start_field','effective_from',
                            'end_field','effective_to',
                            'status_field','status',
                            'timeline_title','Effective ranges',
                            'references',jsonb_build_object(
                                'supplier_profile_id',jsonb_build_object('target_entity','company_code_supplier_profile','target_field','id','display_field','company_code_id'),
                                'gl_account_id',jsonb_build_object('target_entity','gl_account','target_field','id','display_field','name','picker',jsonb_build_object('code_field','code','show_code',true))
                            ),
                            'columns',jsonb_build_array(
                                jsonb_build_object('field','posting_role_code','label','Posting role','kind','code'),
                                jsonb_build_object('field','gl_account_id','label','GL account'),
                                jsonb_build_object('field','book_code','label','Book','kind','code'),
                                jsonb_build_object('field','effective_from','label','Effective from'),
                                jsonb_build_object('field','effective_to','label','Effective to'),
                                jsonb_build_object('field','reason','label','Reason'),
                                jsonb_build_object('field','status','label','Status','kind','status')
                            ),
                            'labels',jsonb_build_object(
                                'supplier_profile_id','Company profile',
                                'posting_role_code','Posting role',
                                'gl_account_id','GL account'
                            )
                        ),
                        'defaultSort',jsonb_build_array('effective_from:desc')
                    ))
            ))
        -- Comments / Attachments / Activity are NOT tabs — they are platform_panels
    );
    v_rmc jsonb := jsonb_build_object(
        'type_label',          'SUPPLIER',
        'classification_field','supplier_type',
        'header_facts',        jsonb_build_array('registration_country_code','supplier_type'),
        'status_dimensions',   jsonb_build_array(
            jsonb_build_object(
                'id','approval',
                'label','Approval',
                'source_entity','supplier_qualification',
                'source_field','is_approved_supplier',
                'true_label','Approved Supplier',
                'false_label','Not Approved',
                'true_intent','success',
                'false_intent','warning'
            ),
            jsonb_build_object(
                'id','payment',
                'label','Payment',
                'source_entity','supplier',
                'source_field','is_payment_ready',
                'true_label','Payment Ready',
                'false_label','Payment Not Ready',
                'true_intent','success',
                'false_intent','warning'
            ),
            jsonb_build_object(
                'id','blocks',
                'label','Blocks',
                'source_entity','supplier_qualification',
                'source_field','is_blocked',
                'true_label','Blocked',
                'false_label','No Active Blocks',
                'true_intent','danger',
                'false_intent','neutral'
            )
        ),
        'platform_panels',     jsonb_build_array('comments','attachments','activity'),
        'tabs',                v_tabs
    );
    -- Detail display config: drives supplier 360 view header + tabs.
    -- title_field = 'name'  → BP trading name (merged from BP on GET detail)
    -- code_field  = 'supplier_code' → role code shown in identity strip
    -- subtitle_field = 'legal_name' → BP registered name (merged from BP)
    -- list_* are intentionally minimal — list page uses supplier_app_index via list_entity_code
    v_base jsonb := jsonb_build_object(
        'detail_renderer', 'master',
        'detail_profile',  'rich',
        'list_renderer',   'table',
        'code_field',      'supplier_code',
        'title_field',     'name',
        'subtitle_field',  'legal_name',
        'create_redirect', jsonb_build_object('href_template','/app/business_partner/new?mode={entity_code}'),
        'search_fields',   jsonb_build_array('supplier_code'),
        'list_columns',    jsonb_build_array('supplier_code', 'supplier_type', 'status')
    );
BEGIN
    -- Fresh DB: set full config
    UPDATE control.entity
    SET display_config = v_base || jsonb_build_object('master_config', v_rmc)
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL AND display_config = '{}'::jsonb;

    -- Already-seeded DB: merge canonical values + always overwrite master_config.
    UPDATE control.entity
    SET display_config = display_config || jsonb_build_object(
            'detail_renderer', 'master',
            'detail_profile',  'rich',
            'code_field',      'supplier_code',
            'title_field',     'name',
            'subtitle_field',  'legal_name',
            'create_redirect', jsonb_build_object('href_template','/app/business_partner/new?mode={entity_code}'),
            'search_fields',   jsonb_build_array('supplier_code'),
            'list_columns',    jsonb_build_array('supplier_code', 'supplier_type', 'status'),
            'master_config',   v_rmc)
    WHERE table_schema = 'master' AND table_name = 'supplier'
      AND tenant_id IS NULL
      AND display_config != '{}'::jsonb;
END $dc$;

-- ── 7. Pin id and tenant_id as system/hidden (never rendered in UI) ──────────
-- origin='system' → FieldsRenderer excludes field from view grid
-- ui_type='hidden' → edit-mode field renderer registry uses no-op renderer
-- Covers two cases: rows exist with wrong origin, or rows are missing (UPDATE
-- is a no-op; 000_common_fields.sql will insert them correctly on next run).
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'supplier'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');

-- ── 8. Correct natural_key_fields + feature_flags (BP-first + index redirect) ─
UPDATE control.entity
SET natural_key_fields = ARRAY['supplier_code'],
    display_config     = display_config || '{"default_sort_field":"supplier_code"}'::jsonb,
    feature_flags      = feature_flags || '{"identity_via":"business_partner","list_entity_code":"supplier_app_index","parent_entity":"business_partner","parent_fk":"business_partner_id"}'::jsonb
WHERE table_schema = 'master' AND table_name = 'supplier'
  AND tenant_id IS NULL;

-- ── 9. Company Setup tab (supplier_cc_extension renderer) ────────────────────
-- Adds the __cc_extension tab alongside the existing __company_codes tab.
-- Idempotent: skips if the tab id already present in master_config.tabs.
-- The tab drives the SupplierCcExtensionTab TSX component via:
--   renderer = 'supplier_cc_extension'
-- presentation_config carries:
--   profile_display_fields → which AP profile fields to show (no hardcode in TSX)
--   policy_sections        → which child policy entities to surface (no hardcode in TSX)
UPDATE control.entity
SET display_config = jsonb_set(
    display_config,
    '{master_config,tabs}',
    (display_config -> 'master_config' -> 'tabs') || jsonb_build_array(
        jsonb_build_object(
            'id',          '__cc_extension',
            'label',       'Company Setup',
            'renderer',    'supplier_cc_extension',
            'entity_code', 'company_code_supplier_profile',
            'add_label',   'Add Company Profile',
            'empty_title', 'No company profiles configured',
            'empty_description', 'Add per-company AP and procurement settings for this supplier.',
            'config', jsonb_build_object(
                'title',        'company_code_id',
                'facts',        jsonb_build_array('currency_code','payment_term_id','payment_method_id','tax_group_id'),
                'badges',       jsonb_build_array('status','is_blocked'),
                'presentation', 'supplier_cc_extension',
                'presentation_config', jsonb_build_object(
                    'profile_display_fields', jsonb_build_array(
                        'currency_code',
                        'payment_term_id',
                        'payment_method_id',
                        'preferred_remittance_bank_link_id',
                        'default_accounting_profile_id',
                        'tax_group_id',
                        'default_wht_tax_group_id',
                        'invoice_hold_policy_id'
                    ),
                    'policy_sections', jsonb_build_array(
                        jsonb_build_object(
                            'id',          'spend_policies',
                            'label',       'Spend Policies',
                            'entity_code', 'company_code_supplier_spend_policy',
                            'add_label',   'Add Spend Policy'
                        ),
                        jsonb_build_object(
                            'id',          'intent_policies',
                            'label',       'Intent Policies',
                            'entity_code', 'company_code_supplier_intent_policy',
                            'add_label',   'Add Intent Policy'
                        ),
                        jsonb_build_object(
                            'id',          'posting_overrides',
                            'label',       'Posting Overrides',
                            'entity_code', 'company_code_supplier_posting_override',
                            'add_label',   'Add Override'
                        )
                    )
                )
            )
        )
    )
)
WHERE table_schema = 'master' AND table_name = 'supplier'
  AND tenant_id IS NULL
  AND NOT (display_config -> 'master_config' -> 'tabs') @> '[{"id":"__cc_extension"}]'::jsonb;
