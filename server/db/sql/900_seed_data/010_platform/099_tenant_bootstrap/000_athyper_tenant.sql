-- ============================================================================
-- PHASE 2 — ATHYPER TENANT BOOTSTRAP
-- ============================================================================
-- File:     010_platform/099_tenant_bootstrap/000_athyper_tenant.sql
-- Schema:   master.tenant
-- Purpose:  Ensure the Athyper demo tenant row exists before Phase 3
--           (020_universal + 030_industry) seeds run. The full org-structure
--           seed lives in 040_tenants/010_demo/ — this file only creates the
--           minimal tenant record so that migrate.ts can resolve the UUID and
--           set app.seed_tenant_id before blueprint seeds execute.
-- Depends:  010_platform/000_bootstrap (system principal)
-- Idempotent: Yes — ON CONFLICT DO NOTHING
-- ============================================================================

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    INSERT INTO master.tenant (
        code, name, display_name, realm_key, region, subscription,
        status, created_by
    ) VALUES (
        'athyper',
        'Athyper Group',
        'Athyper Group Holdings',
        'athyper',
        'GCC',
        'enterprise',
        'active',
        v_su
    )
    ON CONFLICT (realm_key, code) DO NOTHING;

    RAISE NOTICE '[099_tenant_bootstrap] Athyper tenant ready (id=%)',
        (SELECT id FROM master.tenant WHERE code = 'athyper');
END $$;
