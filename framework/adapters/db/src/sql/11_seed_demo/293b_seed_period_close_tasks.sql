/* ============================================================================
   Athyper v2.3 — Period Close Task Seed Data (Blueprint-Based)
   Table: fin.period_close_task
   Dependencies: core.tenant, fin.operating_unit (entity_code discovery)

   Seeds standard period close tasks for all demo tenants.
   Blueprint filtering ensures simpler tenants (A/B) get fewer tasks
   while enterprise tenants (D/E/F) get the full close suite.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_entity   text;
    v_bp       text;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Default blueprint (blueprint_code column not available)
        v_bp := 'C';

        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- ================================================================
            -- SUBLEDGER tasks (gate SOFT_CLOSE)
            -- ================================================================
            INSERT INTO fin.period_close_task (
                id, tenant_id, entity_code, task_code, task_name, description,
                category, required_before, sort_order,
                is_mandatory, is_waivable, waiver_requires_approval, waiver_reason_required,
                completion_mode, system_check_handler, blueprint_filter,
                default_owner_role, sla_hours, severity, reminder_lead_hours
            ) VALUES
                -- AR Reconciliation — all blueprints
                (gen_random_uuid(), v_tenant, v_entity,
                 'AR_RECON', 'AR Subledger Reconciliation',
                 'Reconcile accounts receivable subledger to GL control account',
                 'SUBLEDGER', 'SOFT_CLOSE', 10,
                 true, true, true, true,
                 'HYBRID', 'close.ar_reconciliation', null,
                 'ACCOUNTANT', 24, 'high', 4),

                -- AP Reconciliation — all blueprints
                (gen_random_uuid(), v_tenant, v_entity,
                 'AP_RECON', 'AP Subledger Reconciliation',
                 'Reconcile accounts payable subledger to GL control account',
                 'SUBLEDGER', 'SOFT_CLOSE', 20,
                 true, true, true, true,
                 'HYBRID', 'close.ap_reconciliation', null,
                 'ACCOUNTANT', 24, 'high', 4),

                -- Inventory Valuation — C and above
                (gen_random_uuid(), v_tenant, v_entity,
                 'INV_VALUATION', 'Inventory Valuation Check',
                 'Verify inventory subledger balances match GL and valuation layers are consistent',
                 'SUBLEDGER', 'SOFT_CLOSE', 30,
                 true, true, true, true,
                 'HYBRID', 'close.inventory_valuation', '{C,D,E,F}',
                 'ACCOUNTANT', 24, 'high', 4),

                -- Asset Depreciation Run — C and above (SYSTEM handler implemented)
                (gen_random_uuid(), v_tenant, v_entity,
                 'ASSET_DEPRECIATION', 'Asset Depreciation Run',
                 'Execute depreciation calculation batch for all active assets in the period',
                 'SUBLEDGER', 'SOFT_CLOSE', 40,
                 true, false, true, true,
                 'SYSTEM', 'close.asset_depreciation', '{C,D,E,F}',
                 'CONTROLLER', 8, 'critical', 2),

                -- WIP Clearance — D and above (production)
                (gen_random_uuid(), v_tenant, v_entity,
                 'WIP_CLEARANCE', 'WIP Account Clearance',
                 'Clear work-in-progress accounts for completed production orders',
                 'SUBLEDGER', 'SOFT_CLOSE', 50,
                 true, true, true, true,
                 'HYBRID', 'close.wip_clearance', '{D,E,F}',
                 'ACCOUNTANT', 24, 'medium', 4),

                -- Commission Accrual — D and above
                (gen_random_uuid(), v_tenant, v_entity,
                 'COMMISSION_ACCRUAL', 'Commission Accrual/Settlement',
                 'Calculate and post commission accruals or settle open commission statements',
                 'SUBLEDGER', 'SOFT_CLOSE', 60,
                 true, true, true, true,
                 'HYBRID', 'close.commission_accrual', '{D,E,F}',
                 'ACCOUNTANT', 24, 'medium', 4),

            -- ================================================================
            -- CASH tasks (gate SOFT_CLOSE)
            -- ================================================================

                -- Bank Reconciliation — all blueprints (SYSTEM handler implemented)
                (gen_random_uuid(), v_tenant, v_entity,
                 'BANK_RECON', 'Bank Reconciliation Completion',
                 'Complete bank statement reconciliation for all accounts in the period',
                 'CASH', 'SOFT_CLOSE', 70,
                 true, true, true, true,
                 'HYBRID', 'close.bank_reconciliation', null,
                 'ACCOUNTANT', 48, 'high', 8),

            -- ================================================================
            -- CONSOLIDATION tasks (gate SOFT_CLOSE) — E/F only
            -- ================================================================

                -- Intercompany Elimination — E/F (multi-entity)
                (gen_random_uuid(), v_tenant, v_entity,
                 'IC_ELIMINATION', 'Intercompany Elimination',
                 'Generate and post intercompany elimination entries for consolidation',
                 'CONSOLIDATION', 'SOFT_CLOSE', 80,
                 true, false, true, true,
                 'SYSTEM', 'close.ic_elimination', '{E,F}',
                 'CONTROLLER', 12, 'critical', 2),

                -- FX Revaluation — D and above (SYSTEM handler implemented)
                (gen_random_uuid(), v_tenant, v_entity,
                 'FX_REVALUATION', 'FX Revaluation',
                 'Revalue foreign-currency-denominated balances at period-end rates',
                 'CONSOLIDATION', 'SOFT_CLOSE', 90,
                 true, false, true, true,
                 'SYSTEM', 'close.fx_revaluation', '{D,E,F}',
                 'CONTROLLER', 8, 'critical', 2),

            -- ================================================================
            -- TAX tasks (gate SOFT_CLOSE)
            -- ================================================================

                -- Tax Provision — C and above
                (gen_random_uuid(), v_tenant, v_entity,
                 'TAX_PROVISION', 'Tax Provision Calculation',
                 'Calculate income tax provision and post tax journal entries',
                 'TAX', 'SOFT_CLOSE', 100,
                 true, true, true, true,
                 'HYBRID', 'close.tax_provision', '{C,D,E,F}',
                 'TAX_ACCOUNTANT', 24, 'high', 4),

            -- ================================================================
            -- REVENUE tasks (gate SOFT_CLOSE)
            -- ================================================================

                -- Revenue Recognition — D and above
                (gen_random_uuid(), v_tenant, v_entity,
                 'REVENUE_RECOGNITION', 'Revenue Recognition Cutoff',
                 'Verify revenue is recognized in the correct period per ASC 606 / IFRS 15',
                 'REVENUE', 'SOFT_CLOSE', 110,
                 true, true, true, true,
                 'MANUAL', null, '{D,E,F}',
                 'CONTROLLER', 48, 'high', 8),

            -- ================================================================
            -- ADJUSTMENTS tasks (gate SOFT_CLOSE)
            -- ================================================================

                -- Accrual Reversal — C and above
                (gen_random_uuid(), v_tenant, v_entity,
                 'ACCRUAL_REVERSAL', 'Auto-Reverse Prior Period Accruals',
                 'Process automatic reversal of prior period accrual journal entries',
                 'ADJUSTMENTS', 'SOFT_CLOSE', 120,
                 true, false, true, true,
                 'SYSTEM', 'close.accrual_reversal', '{C,D,E,F}',
                 null, 4, 'medium', 1),

            -- ================================================================
            -- VALIDATION tasks (gate SOFT_CLOSE)
            -- ================================================================

                -- Trial Balance Validation — all blueprints (SYSTEM handler implemented)
                (gen_random_uuid(), v_tenant, v_entity,
                 'TRIAL_BALANCE', 'Trial Balance Validation',
                 'Verify trial balance is in balance (total debits = total credits)',
                 'VALIDATION', 'SOFT_CLOSE', 130,
                 true, false, true, true,
                 'SYSTEM', 'close.trial_balance_validation', null,
                 null, 2, 'critical', 1),

                -- Cutoff Review — C and above
                (gen_random_uuid(), v_tenant, v_entity,
                 'CUTOFF_REVIEW', 'Revenue/Expense Cutoff Review',
                 'Verify no transactions are posted to the wrong period',
                 'VALIDATION', 'SOFT_CLOSE', 140,
                 true, true, true, true,
                 'MANUAL', null, '{C,D,E,F}',
                 'CONTROLLER', 48, 'high', 8),

            -- ================================================================
            -- APPROVAL tasks (gate HARD_CLOSE)
            -- ================================================================

                -- Management Sign-off — all blueprints
                (gen_random_uuid(), v_tenant, v_entity,
                 'MGMT_SIGNOFF', 'Management Sign-off',
                 'Controller/CFO approval confirming period financials are complete and accurate',
                 'APPROVAL', 'HARD_CLOSE', 200,
                 true, false, true, true,
                 'MANUAL', null, null,
                 'CFO', 72, 'critical', 24)

            ON CONFLICT (tenant_id, entity_code, task_code) DO NOTHING;

        END LOOP; -- entity_code

        RAISE NOTICE 'Period close tasks seeded for tenant % (blueprint %)', v_code, v_bp;
    END LOOP; -- tenant
END $$;
