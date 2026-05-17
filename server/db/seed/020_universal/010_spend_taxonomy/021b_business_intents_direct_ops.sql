-- ============================================================================
-- UNIVERSAL - DIRECT-OPS INTENT GUARD
-- ============================================================================
-- Direct-ops categories now reuse domain-level business intents. This guard
-- keeps the legacy seed order intact without creating leaf business intents.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-OPEX' AND is_active = true)
       OR NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-CAPEX' AND is_active = true)
       OR NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-COGS' AND is_active = true)
       OR NOT EXISTS (SELECT 1 FROM master.business_intent WHERE tenant_id = v_tid AND code = 'BI-REG' AND is_active = true) THEN
        RAISE EXCEPTION '[021b_domain_intents] Required domain intents missing - run 021_business_intents.sql first';
    END IF;

    RAISE NOTICE '[021b_domain_intents] Direct-ops categories use domain-level business intents';
END $seed$;
