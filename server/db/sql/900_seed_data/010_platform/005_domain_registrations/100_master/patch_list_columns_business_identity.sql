-- patch_list_columns_business_identity.sql
-- Applies business-user column layout for Business Partner, Supplier App Index,
-- and Customer App Index without a full re-seed.
-- Safe to run multiple times (plain UPDATEs; no INSERTs).
--
-- PREREQUISITES — run these DDL statements first if the columns do not exist:
--   ALTER TABLE master.supplier_app_index
--       ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}';
--   ALTER TABLE master.customer_app_index
--       ADD COLUMN IF NOT EXISTS legal_form text,
--       ADD COLUMN IF NOT EXISTS business_types text[] NOT NULL DEFAULT '{}';
--
-- After DDL, backfill existing rows:
--   UPDATE master.supplier_app_index sai
--   SET business_types = coalesce(bp.business_types, '{}')
--   FROM master.business_partner bp
--   WHERE bp.id = sai.business_partner_id AND bp.tenant_id = sai.tenant_id;
--
--   UPDATE master.customer_app_index cai
--   SET legal_form     = bp.legal_form,
--       business_types = coalesce(bp.business_types, '{}')
--   FROM master.business_partner bp
--   WHERE bp.id = cai.business_partner_id AND bp.tenant_id = cai.tenant_id;

-- Business Partner: list layout matching the business partner list screenshot
UPDATE control.entity
SET display_config = COALESCE(display_config, '{}'::jsonb)
    || jsonb_build_object(
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'default_sort_order', 'asc',
        'list_columns',       jsonb_build_array('code','name','registration_country_code','legal_form','status'),
        'compact_card',       jsonb_build_object(
            'bottom_fields',  jsonb_build_array('registration_country_code','legal_form'))
    )
WHERE table_schema = 'master' AND table_name = 'business_partner'
  AND tenant_id IS NULL;

-- Keep the current list resolver's sort_order-based column order aligned with
-- the seeded list_columns order.
UPDATE control.entity_field ef
SET sort_order = 72
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.table_schema = 'master'
  AND e.table_name = 'business_partner'
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.name = 'legal_form'
  AND ef.sort_order IS DISTINCT FROM 72;

-- Supplier App Index: business identity first, then role status and payment signal
UPDATE control.entity
SET display_config = display_config
    || jsonb_build_object(
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'list_columns',       jsonb_build_array('name','supplier_code','supplier_status','supplier_type','registration_country_code','is_payment_ready')
    )
WHERE table_schema = 'master' AND table_name = 'supplier_app_index'
  AND tenant_id IS NULL;

-- Customer App Index: business identity first, then role status and credit signal
UPDATE control.entity
SET display_config = display_config
    || jsonb_build_object(
        'default_sort_field', 'name',
        'default_sort_dir',   'asc',
        'list_columns',       jsonb_build_array('name','customer_code','customer_status','customer_type','is_key_account','registration_country_code','risk_rating')
    )
WHERE table_schema = 'master' AND table_name = 'customer_app_index'
  AND tenant_id IS NULL;
