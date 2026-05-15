-- ============================================================================
-- CIRRUSATLANTIC — MODULE SUBSCRIPTIONS
-- ============================================================================
-- File:     001_module_subscriptions.sql
-- Schema:   master.tenant_module_subscription
-- Purpose:  Subscribe CirrusAtlantic to all available modules.
-- Depends:  000_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id, module_id) DO NOTHING
-- ============================================================================

DO $catl_subs$
DECLARE
    v_tid uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_module_subscriptions] CirrusAtlantic tenant not found';
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

    RAISE NOTICE '[001_module_subscriptions] CirrusAtlantic subscribed to all modules';

END $catl_subs$;
