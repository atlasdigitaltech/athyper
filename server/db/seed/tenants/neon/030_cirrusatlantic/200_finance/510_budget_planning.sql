-- seed-pack-version: 2.0.0
-- disposition: retired-demo-data
--
-- The legacy payload contained example planning models, named projects,
-- historical approvals, budgets, allocations, and consumed amounts. Those are
-- tenant transactions/scenarios rather than production onboarding reference
-- data and are intentionally not migrated into the current document/ledger
-- planning model. This bridge preserves an explicit application receipt.

DO $seed$
DECLARE
    v_tid   uuid := nullif(current_setting('app.seed_tenant_id', true), '')::uuid;
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
BEGIN
    IF v_tid IS NULL OR NOT EXISTS (
        SELECT 1
          FROM master.tenant AS tenant
         WHERE tenant.id = v_tid
           AND tenant.realm_key = 'athyper'
           AND tenant.code = 'cirrusatlantic'
           AND tenant.status = 'active'
    ) THEN
        RAISE EXCEPTION '[510_budget_planning] active CirrusAtlantic tenant scope required';
    END IF;

    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1
          FROM master.principal AS principal
         WHERE principal.id = v_actor
           AND principal.tenant_id = v_tid
           AND principal.status = 'active'
    ) THEN
        RAISE EXCEPTION '[510_budget_planning] active tenant-local seed principal required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.company_code AS company
         WHERE company.tenant_id = v_tid
           AND company.code = 'catl'
           AND company.status = 'active'
    ) THEN
        RAISE EXCEPTION '[510_budget_planning] active catl company required';
    END IF;

    RAISE NOTICE
        '[510_budget_planning] retired legacy demo planning scenarios; no production data applied';
END $seed$;
