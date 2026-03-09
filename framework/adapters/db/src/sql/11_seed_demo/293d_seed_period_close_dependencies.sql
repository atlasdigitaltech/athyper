/* ============================================================================
   Athyper v2.4 — Period Close Task Dependency Seed Data
   Table: fin.period_close_task_dependency
   Dependencies: 293b_seed_period_close_tasks.sql (task templates),
                 199_period_close_orchestration_graph.sql (dependency table)

   Seeds operational dependency edges for the close orchestration graph.
   Only true operational prerequisites — not conceptual relationships.

   Graph structure (sparse, enterprise-grade):

   Foundation reconciliations → TRIAL_BALANCE
     AR_RECON ──────────────┐
     AP_RECON ──────────────┤
     BANK_RECON ────────────┤
     INV_VALUATION ─────────┼──→ TRIAL_BALANCE
     ASSET_DEPRECIATION ────┤
     FX_REVALUATION ────────┤
     ACCRUAL_REVERSAL ──────┘

   Trial balance → controls / reporting
     TRIAL_BALANCE ──→ CUTOFF_REVIEW
     TRIAL_BALANCE ──→ TAX_PROVISION

   Consolidation chain
     IC_ELIMINATION ──→ TRIAL_BALANCE   (if E/F blueprint)

   Review / signoff chain
     CUTOFF_REVIEW ──────┐
     TAX_PROVISION ──────┼──→ MGMT_SIGNOFF
     TRIAL_BALANCE ──────┘

   Also updates task templates with estimated_duration_minutes and
   orchestration_group for critical path and UI swimlanes.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    -- Task IDs (resolved per tenant+entity)
    v_ar       uuid;
    v_ap       uuid;
    v_inv      uuid;
    v_asset    uuid;
    v_wip      uuid;
    v_bank     uuid;
    v_ic       uuid;
    v_fx       uuid;
    v_tax      uuid;
    v_revenue  uuid;
    v_accrual  uuid;
    v_tb       uuid;
    v_cutoff   uuid;
    v_mgmt     uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.period_close_task
            WHERE tenant_id = v_tenant AND is_active = true
            ORDER BY entity_code
        LOOP
            -- Resolve task IDs
            SELECT id INTO v_ar     FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'AR_RECON';
            SELECT id INTO v_ap     FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'AP_RECON';
            SELECT id INTO v_inv    FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'INV_VALUATION';
            SELECT id INTO v_asset  FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'ASSET_DEPRECIATION';
            SELECT id INTO v_wip    FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'WIP_CLEARANCE';
            SELECT id INTO v_bank   FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'BANK_RECON';
            SELECT id INTO v_ic     FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'IC_ELIMINATION';
            SELECT id INTO v_fx     FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'FX_REVALUATION';
            SELECT id INTO v_tax    FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'TAX_PROVISION';
            SELECT id INTO v_revenue FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'REVENUE_RECOGNITION';
            SELECT id INTO v_accrual FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'ACCRUAL_REVERSAL';
            SELECT id INTO v_tb     FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'TRIAL_BALANCE';
            SELECT id INTO v_cutoff FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'CUTOFF_REVIEW';
            SELECT id INTO v_mgmt   FROM fin.period_close_task WHERE tenant_id = v_tenant AND entity_code = v_entity AND task_code = 'MGMT_SIGNOFF';

            -- Skip if trial balance not found (minimum required task)
            IF v_tb IS NULL THEN CONTINUE; END IF;

            -- ================================================================
            -- Foundation → TRIAL_BALANCE edges
            -- ================================================================
            IF v_ar IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_ar, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_ap IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_ap, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_bank IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_bank, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_inv IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_inv, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_asset IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_asset, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_fx IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_fx, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_accrual IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_accrual, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            -- IC_ELIMINATION → TRIAL_BALANCE (E/F only)
            IF v_ic IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_ic, v_tb, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            -- ================================================================
            -- TRIAL_BALANCE → downstream edges
            -- ================================================================
            IF v_cutoff IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_tb, v_cutoff, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            IF v_tax IS NOT NULL THEN
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_tb, v_tax, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
            END IF;

            -- ================================================================
            -- Review → MGMT_SIGNOFF edges
            -- ================================================================
            IF v_mgmt IS NOT NULL THEN
                -- TRIAL_BALANCE → MGMT_SIGNOFF
                INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                VALUES (v_tenant, v_tb, v_mgmt, 'seed')
                ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;

                IF v_cutoff IS NOT NULL THEN
                    INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                    VALUES (v_tenant, v_cutoff, v_mgmt, 'seed')
                    ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
                END IF;

                IF v_tax IS NOT NULL THEN
                    INSERT INTO fin.period_close_task_dependency (tenant_id, predecessor_task_id, successor_task_id, created_by)
                    VALUES (v_tenant, v_tax, v_mgmt, 'seed')
                    ON CONFLICT (tenant_id, predecessor_task_id, successor_task_id) DO NOTHING;
                END IF;
            END IF;

            -- ================================================================
            -- Update task templates with orchestration metadata
            -- ================================================================
            UPDATE fin.period_close_task SET
                estimated_duration_minutes = CASE task_code
                    WHEN 'AR_RECON'            THEN 60
                    WHEN 'AP_RECON'            THEN 60
                    WHEN 'INV_VALUATION'       THEN 45
                    WHEN 'ASSET_DEPRECIATION'  THEN 15
                    WHEN 'WIP_CLEARANCE'       THEN 30
                    WHEN 'COMMISSION_ACCRUAL'  THEN 30
                    WHEN 'BANK_RECON'          THEN 90
                    WHEN 'IC_ELIMINATION'      THEN 30
                    WHEN 'FX_REVALUATION'      THEN 15
                    WHEN 'TAX_PROVISION'       THEN 120
                    WHEN 'REVENUE_RECOGNITION' THEN 90
                    WHEN 'ACCRUAL_REVERSAL'    THEN 10
                    WHEN 'TRIAL_BALANCE'       THEN 5
                    WHEN 'CUTOFF_REVIEW'       THEN 60
                    WHEN 'MGMT_SIGNOFF'        THEN 30
                    ELSE estimated_duration_minutes
                END,
                orchestration_group = CASE task_code
                    WHEN 'AR_RECON'            THEN 'subledger_recon'
                    WHEN 'AP_RECON'            THEN 'subledger_recon'
                    WHEN 'INV_VALUATION'       THEN 'subledger_recon'
                    WHEN 'ASSET_DEPRECIATION'  THEN 'subledger_recon'
                    WHEN 'WIP_CLEARANCE'       THEN 'subledger_recon'
                    WHEN 'COMMISSION_ACCRUAL'  THEN 'subledger_recon'
                    WHEN 'BANK_RECON'          THEN 'cash_recon'
                    WHEN 'IC_ELIMINATION'      THEN 'consolidation'
                    WHEN 'FX_REVALUATION'      THEN 'consolidation'
                    WHEN 'TAX_PROVISION'       THEN 'adjustments'
                    WHEN 'REVENUE_RECOGNITION' THEN 'adjustments'
                    WHEN 'ACCRUAL_REVERSAL'    THEN 'adjustments'
                    WHEN 'TRIAL_BALANCE'       THEN 'validation'
                    WHEN 'CUTOFF_REVIEW'       THEN 'validation'
                    WHEN 'MGMT_SIGNOFF'        THEN 'signoff'
                    ELSE orchestration_group
                END
            WHERE tenant_id = v_tenant
              AND entity_code = v_entity
              AND is_active = true;

        END LOOP; -- entity_code

        RAISE NOTICE 'Period close dependencies seeded for tenant %', v_code;
    END LOOP; -- tenant
END $$;
