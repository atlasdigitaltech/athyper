-- ============================================================================
-- CIRRUSATLANTIC — BLUEPRINT APPLICATION TRACKING
-- ============================================================================
-- File:     002_blueprint_applications.sql
-- Schema:   control.blueprint_tenant_application
-- Purpose:  Record the 7 blueprint tiers applied to CirrusAtlantic.
--           Note: pack_ap_non_po is recorded by its own 099_apply.sql.
-- Depends:  000_tenant.sql, seed/platform/007_blueprint_registry/
-- Idempotent: Yes — ON CONFLICT (tenant_id, blueprint_code) DO UPDATE
-- ============================================================================

DO $catl_blueprints$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[002_blueprint_applications] CirrusAtlantic tenant not found';
    END IF;

    INSERT INTO control.blueprint_tenant_application
        (tenant_id, blueprint_code, status, applied_version, applied_by, created_by)
    VALUES
        (v_tid, 'base',             'applied', '1.0.0', v_su, v_su),
        (v_tid, 'foundation_tax',   'applied', '1.0.0', v_su, v_su),
        (v_tid, 'foundation_pay',   'applied', '1.0.0', v_su, v_su),
        (v_tid, 'foundation_assets','applied', '1.0.0', v_su, v_su),
        (v_tid, 'foundation_bank',  'applied', '1.0.0', v_su, v_su),
        (v_tid, 'coa_ifrs',         'applied', '1.0.0', v_su, v_su),
        (v_tid, 'pack_infocomm',    'applied', '1.0.0', v_su, v_su)
    ON CONFLICT (tenant_id, blueprint_code) DO UPDATE SET
        status          = EXCLUDED.status,
        applied_version = EXCLUDED.applied_version,
        applied_at      = now(),
        applied_by      = EXCLUDED.applied_by,
        updated_at      = now(),
        updated_by      = EXCLUDED.applied_by
    WHERE control.blueprint_tenant_application.status
       IS DISTINCT FROM EXCLUDED.status;

    RAISE NOTICE '[002_blueprint_applications] 7 blueprint tiers recorded for CirrusAtlantic';

END $catl_blueprints$;
