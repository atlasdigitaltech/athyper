-- ============================================================================
-- CIRRUSATLANTIC — BLUEPRINT APPLICATION RECEIPT BRIDGE
-- ============================================================================
-- seed-pack-version: 2.0.0
-- Dataset:  cirrusatlantic.blueprint-application-receipt
-- Plane:    neon
-- Scope:    tenant onboarding validation
-- Storage:  public.seed_pack_ledger_v2 / public.seed_pack_execution_v2
-- Retires:  control.blueprint_tenant_application mutable application rows
-- Writes:   none; the provisioner records this file's immutable receipt
-- ============================================================================

DO $catl_blueprint_receipt_bridge$
DECLARE
    v_tid uuid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    v_actor uuid := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    v_industry_packs text[] := string_to_array(
        nullif(trim(current_setting('app.seed_industry_pack_codes', true)), ''),
        ','
    );
BEGIN
    IF current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION '[002_blueprint_applications] Neon plane required';
    END IF;

    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1
          FROM master.tenant
         WHERE id = v_tid
           AND realm_key = 'athyper'
           AND code = 'cirrusatlantic'
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[002_blueprint_applications] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1
          FROM master.principal
         WHERE tenant_id = v_tid
           AND id = v_actor
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION '[002_blueprint_applications] active tenant-local actor required';
    END IF;

    IF v_industry_packs IS NULL OR NOT ('pack_infocomm' = ANY(v_industry_packs)) THEN
        RAISE EXCEPTION
            '[002_blueprint_applications] explicit pack_infocomm selection required';
    END IF;

    IF to_regclass('public.seed_pack_ledger_v2') IS NULL
       OR to_regclass('public.seed_pack_execution_v2') IS NULL THEN
        RAISE EXCEPTION '[002_blueprint_applications] immutable receipt infrastructure required';
    END IF;

    RAISE NOTICE
        '[002_blueprint_applications] legacy mutable rows retired; provisioner receipt will record onboarding';
END
$catl_blueprint_receipt_bridge$;
