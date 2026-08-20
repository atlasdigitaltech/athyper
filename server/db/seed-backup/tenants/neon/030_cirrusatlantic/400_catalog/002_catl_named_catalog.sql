-- seed-pack-version: 2.0.0
-- disposition: retired-demo-data
-- Legacy behavior inserted named commercial products, example prices, and
-- company items. These belong in an explicit demo/test fixture, not tenant
-- onboarding or production reference data.

DO $seed$
DECLARE
    v_tid uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.tenant t
        WHERE t.id=v_tid AND t.code='cirrusatlantic' AND t.status='active'
    ) THEN
        RAISE EXCEPTION '[catl_named_catalog] active CirrusAtlantic tenant scope required';
    END IF;
    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM master.principal p
        WHERE p.id=v_actor AND p.tenant_id=v_tid AND p.status='active'
    ) THEN
        RAISE EXCEPTION '[catl_named_catalog] active tenant-local seed principal required';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.commodity_category c
        WHERE c.tenant_id=v_tid AND c.status='active'
    ) THEN
        RAISE EXCEPTION '[catl_named_catalog] active spend taxonomy required';
    END IF;
    RAISE NOTICE '[catl_named_catalog] retired named demo catalog and prices; no catalog data applied';
END $seed$;
