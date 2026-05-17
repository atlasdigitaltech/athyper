-- 100_master/003_customer.sql
-- Purpose: control.entity + entity_version + entity_field for Customer (master.customer)
-- Module: CRM (Customer Relationship Management)
-- BP-first: customer is a thin AR role — identity fields live on master.business_partner.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- ── 0. Normalize entity_short if previously seeded as 'CUST' ─────────────────
UPDATE control.entity
SET entity_short = 'CUS'
WHERE table_schema = 'master' AND table_name = 'customer'
  AND tenant_id IS NULL AND entity_short = 'CUST';

-- ── 0b. Remove stale field registrations from pre-BP-first schema ─────────────
-- These columns no longer exist on the thin customer table.
DELETE FROM control.entity_field ef
USING control.entity_version ev,
      control.entity e
WHERE ef.entity_version_id = ev.id
  AND e.id = ev.entity_id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('code', 'name', 'legal_name', 'payment_terms', 'currency_code',
                  'tax_number', 'credit_limit', 'contact_email', 'contact_phone',
                  'registration_no', 'tax_country_code', 'website_url');

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
    (SELECT id FROM shared.module WHERE code = 'CRM'),
    'customer', 'CUS', 'customer',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'business', 'controlled',
    'master', 'customer',
    'Customer', 'Customers', 'users', 'teal',
    true,
    '{"prefix":"CUS","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":5}]}'::jsonb,
    '{"is_approvable":false,"party_category":"customer","allow_address":false,"allow_contact":false,"identity_via":"business_partner","list_entity_code":"customer_app_index"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- ── 2. control.entity_version ────────────────────────────────────────────────
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.table_schema = 'master' AND e.table_name = 'customer'
  AND  e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── 3. control.entity_field — thin AR role fields ─────────────────────────────
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
    ('customer_code',     'customer_code',     'Customer Code',     'text',           'one',         NULL::text,                       true,  true,  '{"max_length":30}'::jsonb,  10),
    ('customer_type',     'customer_type',     'Customer Type',     'enum',           'zero_or_one', 'master.customer_type'::text,     false, true,  NULL::jsonb,                 20),
    ('is_key_account',    'is_key_account',    'Key Account',       'boolean',        'one',         NULL::text,                       false, true,  NULL::jsonb,                 30),
    ('risk_rating',       'risk_rating',       'Risk Rating',       'enum',           'zero_or_one', 'master.credit_rating'::text,     false, true,  NULL::jsonb,                 40),
    ('status',            'status',            'Status',            'lifecycle_state','one',         NULL::text,                       true,  true,  NULL::jsonb,                 50)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── Pin id/tenant_id as system/hidden ─────────────────────────────────────────
UPDATE control.entity_field ef
SET origin  = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master' AND e.table_name = 'customer'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name IN ('id', 'tenant_id')
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');

-- ── display_config — AR role lens ─────────────────────────────────────────────
DO $dc$ DECLARE
    v_tabs jsonb := jsonb_build_array(
        jsonb_build_object('id','__overview','label','Overview','renderer','overview'),
        jsonb_build_object('id','__profile','label','Customer Role','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__profile_role','label','Role Profile','type','fields',
                    'display_fields', jsonb_build_array(
                        'customer_code','customer_type','is_key_account','risk_rating','status'
                    ))
            )),
        jsonb_build_object('id','__standing','label','Standing','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__standing_qualification','label','Qualification','type','child',
                    'entity_code','customer_qualification',
                    'display_fields',jsonb_build_array('credit_status','credit_rating','kyc_status','aml_sanctions_status','status'),
                    'empty_title','No qualification record',
                    'empty_description','A qualification record is created when the customer is reviewed.'),
                jsonb_build_object('id','__standing_blocks','label','Blocks & Holds','type','child_list',
                    'entity_code','customer_block',
                    'display_fields',jsonb_build_array('block_type','block_reason','blocked_at','status'),
                    'add_href_template','/app/customer_block/new?parent_id={uuid}',
                    'add_label','Add Block',
                    'empty_title','No active blocks',
                    'empty_description','Credit, invoice, collection, and delivery blocks appear here.',
                    'config',jsonb_build_object(
                        'title','block_type',
                        'facts',jsonb_build_array('block_reason','blocked_at'),
                        'badges',jsonb_build_array('status'),
                        'defaultSort',jsonb_build_array('blocked_at:desc')
                    ))
            )),
        jsonb_build_object('id','__company_codes','label','Company Codes','renderer','composite',
            'composite_sections', jsonb_build_array(
                jsonb_build_object('id','__company_profiles','label','AR Profiles','type','child_list',
                    'entity_code','company_code_customer_profile',
                    'display_fields',jsonb_build_array('company_code_id','credit_limit','credit_limit_currency_code','credit_rating','payment_term_id','is_blocked','status'),
                    'add_href_template','/app/company_code_customer_profile/new?parent_id={uuid}',
                    'add_label','Add Profile',
                    'empty_title','No company profiles',
                    'empty_description','Per-company AR and credit settings appear here.',
                    'config',jsonb_build_object(
                        'title','company_code_id',
                        'facts',jsonb_build_array('credit_limit','credit_limit_currency_code','credit_rating','payment_term_id'),
                        'badges',jsonb_build_array('status'),
                        'defaultSort',jsonb_build_array('created_at:desc')
                    ))
            ))
    );
    v_rmc jsonb := jsonb_build_object(
        'type_label',          'CUSTOMER',
        'classification_field','customer_type',
        'header_facts',        jsonb_build_array('customer_type','is_key_account'),
        'status_dimensions',   '[]'::jsonb,
        'platform_panels',     jsonb_build_array('comments','attachments','activity'),
        'tabs',                v_tabs
    );
    -- title_field = 'name'  → BP trading name (merged from BP on GET detail)
    -- subtitle_field = 'legal_name' → BP registered name
    -- list_* are minimal — list uses customer_app_index via list_entity_code
    v_base jsonb := jsonb_build_object(
        'detail_renderer', 'master',
        'detail_profile',  'rich',
        'list_renderer',   'table',
        'code_field',      'customer_code',
        'title_field',     'name',
        'subtitle_field',  'legal_name',
        'create_redirect', jsonb_build_object('href_template','/app/business_partner/new?mode={entity_code}'),
        'search_fields',   jsonb_build_array('customer_code'),
        'list_columns',    jsonb_build_array('customer_code','customer_type','is_key_account','status')
    );
BEGIN
    UPDATE control.entity
    SET display_config = v_base || jsonb_build_object('master_config', v_rmc)
    WHERE table_schema = 'master' AND table_name = 'customer'
      AND tenant_id IS NULL AND display_config = '{}'::jsonb;

    UPDATE control.entity
    SET display_config = display_config || jsonb_build_object(
            'detail_renderer', 'master',
            'detail_profile',  'rich',
            'code_field',      'customer_code',
            'title_field',     'name',
            'subtitle_field',  'legal_name',
            'create_redirect', jsonb_build_object('href_template','/app/business_partner/new?mode={entity_code}'),
            'search_fields',   jsonb_build_array('customer_code'),
            'list_columns',    jsonb_build_array('customer_code','customer_type','is_key_account','status'),
            'master_config',   v_rmc)
    WHERE table_schema = 'master' AND table_name = 'customer'
      AND tenant_id IS NULL AND display_config != '{}'::jsonb;
END $dc$;

-- ── Correct natural_key_fields + feature_flags (BP-first + index redirect) ────
UPDATE control.entity
SET natural_key_fields = ARRAY['customer_code'],
    display_config     = display_config || '{"default_sort_field":"customer_code"}'::jsonb,
    feature_flags      = feature_flags || '{"identity_via":"business_partner","list_entity_code":"customer_app_index","parent_entity":"business_partner","parent_fk":"business_partner_id"}'::jsonb
WHERE table_schema = 'master' AND table_name = 'customer'
  AND tenant_id IS NULL;
