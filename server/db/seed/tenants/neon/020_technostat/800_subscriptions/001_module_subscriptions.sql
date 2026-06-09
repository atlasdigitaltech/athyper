-- ============================================================================
-- TECHNOSTAT — MODULE SUBSCRIPTIONS
-- ============================================================================
-- File:     001_module_subscriptions.sql
-- Schema:   master.tenant_module_subscription
-- Purpose:  Subscribe Technostat to all available modules.
-- Depends:  003_technostat_production_seed.sql (P01 — tenant row)
-- Idempotent: Yes — ON CONFLICT (tenant_id, module_id) DO NOTHING
-- ============================================================================

DO $tstat_subs$
DECLARE
    v_tid uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_module_subscriptions] Technostat tenant not found';
    END IF;

    INSERT INTO master.tenant_module_subscription (id, tenant_id, module_id, status, created_by)
    SELECT
        gen_random_uuid(),
        v_tid,
        m.id,
        'active',
        '00000000-0000-0000-0000-000000000000'
    FROM shared.module m
    ON CONFLICT (tenant_id, module_id) DO NOTHING;

    RAISE NOTICE '[001_module_subscriptions] Technostat subscribed to all modules';

END $tstat_subs$;
