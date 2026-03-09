/* ============================================================================
   Athyper v2.4 — DEMO SEED: Open Fiscal Periods for 3-Month Demo
   Table: fin.fiscal_period
   Dependencies: 293_seed_demo_fiscal.sql (creates periods in OPEN/FUTURE status)

   Updates fiscal period statuses to create a realistic 3-month window:
     - Period 1 (Jan/Apr): HARD_CLOSE  (fully closed)
     - Period 2 (Feb/May): SOFT_CLOSE  (in close process)
     - Period 3 (Mar/Jun): OPEN        (current active period)

   For Apr-start tenants (demo_in, demo_ca), P1=Apr, P2=May, P3=Jun.
   DEMO DATA ONLY — not required for production deployments.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_sys_user uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Period 1: HARD_CLOSE (fully closed month)
            UPDATE fin.fiscal_period SET
                status         = 'HARD_CLOSE',
                opened_at      = now() - interval '60 days',
                soft_closed_at = now() - interval '32 days',
                hard_closed_at = now() - interval '30 days',
                closed_by      = v_sys_user
            WHERE tenant_id   = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 1
              AND status != 'HARD_CLOSE';

            -- Period 2: SOFT_CLOSE (in close process)
            UPDATE fin.fiscal_period SET
                status         = 'SOFT_CLOSE',
                opened_at      = now() - interval '30 days',
                soft_closed_at = now() - interval '2 days',
                closed_by      = v_sys_user
            WHERE tenant_id   = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 2
              AND status NOT IN ('SOFT_CLOSE', 'HARD_CLOSE');

            -- Period 3: OPEN (current active period)
            UPDATE fin.fiscal_period SET
                status    = 'OPEN',
                opened_at = now() - interval '5 days'
            WHERE tenant_id   = v_tenant
              AND entity_code = v_entity
              AND fiscal_year = 2026
              AND period_number = 3
              AND status = 'FUTURE';

        END LOOP;

        RAISE NOTICE 'Fiscal periods opened (P1=HARD_CLOSE, P2=SOFT_CLOSE, P3=OPEN) for tenant %', v_code;
    END LOOP;
END $$;
