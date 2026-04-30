-- 100_master/010_company_code_profiles.sql
-- Purpose: display_config + natural_key_fields for company-code profile junction entities.
--   company_code_customer_profile — per-company AR/credit settings for a customer
--   company_code_supplier_profile — per-company AP/payment settings for a supplier
--
-- These entities are registered in 020_entities/008_master_partners.sql and get
-- their entity_version from 025_entity_versions.sql and fields from
-- 035_version_fields/008_fields_partners.sql.  The batch setter in
-- 080_display_config_natural_key.sql may not have run on DBs where these
-- entities were applied as an incremental migration.
--
-- Idempotent: only fires when display_config is still '{}' OR natural_key_fields
-- is empty — same guard pattern as 004_vendor_service_coverage.sql §4.

-- ── company_code_customer_profile ────────────────────────────────────────────
UPDATE control.entity
SET display_config     = jsonb_build_object(
        'detail_renderer',    'standard',
        'list_columns',       '["customer_id","company_code_id","ar_account_id","credit_limit_local"]'::jsonb,
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc'
    ),
    natural_key_fields = ARRAY['id']
WHERE table_schema = 'master' AND table_name = 'company_code_customer_profile'
  AND tenant_id IS NULL
  AND (display_config = '{}'::jsonb
       OR natural_key_fields IS NULL
       OR natural_key_fields = '{}');

-- ── company_code_supplier_profile ────────────────────────────────────────────
UPDATE control.entity
SET display_config     = jsonb_build_object(
        'detail_renderer',    'standard',
        'list_columns',       '["supplier_id","company_code_id","ap_account_id","payment_method_id"]'::jsonb,
        'default_sort_field', 'created_at',
        'default_sort_order', 'desc'
    ),
    natural_key_fields = ARRAY['id']
WHERE table_schema = 'master' AND table_name = 'company_code_supplier_profile'
  AND tenant_id IS NULL
  AND (display_config = '{}'::jsonb
       OR natural_key_fields IS NULL
       OR natural_key_fields = '{}');
