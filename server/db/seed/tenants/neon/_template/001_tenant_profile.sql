-- ============================================================================
-- TENANT ONBOARDING — Step 2: Tenant Profile & Blueprint Selection
-- ============================================================================
-- Run AFTER 000_tenant.sql.
-- Set the session variable before running blueprint seeds:
--   SET app.seed_tenant_id = '__CLIENT_UUID__';
--
-- Blueprint selection:
--   COA framework   -> exactly one of: coa_ifrs | coa_gaap
--   Industry packs  → one or more from blueprints/industry/100_industry_packs/
--   Module packs    → per subscription from blueprints/modules/
-- ============================================================================

BEGIN;

-- Record which blueprints to apply (runner reads this after tenant creation)
INSERT INTO control.tenant_provisioning_request (
    tenant_id,
    coa_framework,        -- 'coa_ifrs' | 'coa_gaap'
    industry_packs,       -- array, e.g. ARRAY['pack_trading','pack_infocomm']
    module_packs,         -- array, e.g. ARRAY['pack_ap_non_po']
    requested_by
)
VALUES (
    '__CLIENT_UUID__'::uuid,
    '__COA_FRAMEWORK__',
    ARRAY[__INDUSTRY_PACKS__],
    ARRAY[__MODULE_PACKS__],
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id) DO UPDATE SET
    coa_framework    = EXCLUDED.coa_framework,
    industry_packs   = EXCLUDED.industry_packs,
    module_packs     = EXCLUDED.module_packs;

COMMIT;
