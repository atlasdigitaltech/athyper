-- ============================================================================
-- ledger/03_constraints.sql
-- Concept: Ledger FKs — ledger → document and master FK graph
-- Depends on: 04_tables/005_ledger.sql
-- ============================================================================
-- FK constraints for ledger schema. Idempotent via DO blocks.

-- ── ledger.gl_balance ────────────────────────────────────────────────────────
ALTER TABLE ledger.gl_balance DROP CONSTRAINT IF EXISTS glb_tenant_fk;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_account_fk
    FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_cc_fk
    FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_pc_fk
    FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_project_fk
    FOREIGN KEY (tenant_id, project_id) REFERENCES master.project (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_dimset_fk
    FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.gl_balance ADD CONSTRAINT glb_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET MANAGEMENT MODULE — Foreign Key Constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.asset_revaluation_reserve ────────────────────────────────────────
ALTER TABLE ledger.asset_revaluation_reserve DROP CONSTRAINT IF EXISTS arr_tenant_fk;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_asset_fk
    FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_book_fk
    FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_txn_fk
    FOREIGN KEY (tenant_id, asset_transaction_id)
    REFERENCES document.asset_transaction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_je_fk
    FOREIGN KEY (tenant_id, reference_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.asset_revaluation_reserve ADD CONSTRAINT arr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── ledger.tax_calculation ───────────────────────────────────────────────────
-- tc_schedule_fk uses tenant-composite (tenant_id, tax_rate_schedule_id) for isolation.
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_period_fk
    FOREIGN KEY (fiscal_period_id)
    REFERENCES master.fiscal_period (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_group_fk
    FOREIGN KEY (tenant_id, tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_schedule_fk
    FOREIGN KEY (tenant_id, tax_rate_schedule_id)
    REFERENCES control.tax_rate_schedule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_reversal_fk
    FOREIGN KEY (reverses_calculation_id)
    REFERENCES ledger.tax_calculation (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_calculation ADD CONSTRAINT tc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.tax_credit_movement ───────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_source_movement_fk
    FOREIGN KEY (source_movement_id)
    REFERENCES ledger.tax_credit_movement (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_source_calc_fk
    FOREIGN KEY (source_tax_calculation_id)
    REFERENCES ledger.tax_calculation (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.tax_credit_movement ADD CONSTRAINT tcm_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.fx_revaluation_line ───────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE ledger.fx_revaluation_line ADD CONSTRAINT fxrl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.fx_revaluation_line ADD CONSTRAINT fxrl_run_fk
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES document.fx_revaluation_run (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.fx_revaluation_line ADD CONSTRAINT fxrl_account_fk
    FOREIGN KEY (tenant_id, gl_account_id)
    REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.fx_revaluation_line ADD CONSTRAINT fxrl_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.fx_revaluation_line ADD CONSTRAINT fxrl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.consolidation_elimination ─────────────────────────────────────────
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_dest_company_fk
    FOREIGN KEY (tenant_id, dest_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_je_fk
    FOREIGN KEY (tenant_id, reference_je_id)
    REFERENCES document.journal_entry (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Ledger FK constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.commitment_schedule ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE ledger.commitment_schedule
        ADD CONSTRAINT fk_cs_commitment
            FOREIGN KEY (tenant_id, commitment_id)
                REFERENCES document.commitment (tenant_id, id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.commitment_schedule
        ADD CONSTRAINT fk_cs_allocation
            FOREIGN KEY (tenant_id, budget_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.commitment_fulfillment ────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE ledger.commitment_fulfillment
        ADD CONSTRAINT fk_cf_commitment
            FOREIGN KEY (tenant_id, commitment_id)
                REFERENCES document.commitment (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.commitment_fulfillment
        ADD CONSTRAINT fk_cf_schedule
            FOREIGN KEY (tenant_id, schedule_id)
                REFERENCES ledger.commitment_schedule (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.commitment_fulfillment
        ADD CONSTRAINT fk_cf_reversal
            FOREIGN KEY (tenant_id, reverses_id)
                REFERENCES ledger.commitment_fulfillment (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.budget_transaction ────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE ledger.budget_transaction
        ADD CONSTRAINT fk_btr_allocation
            FOREIGN KEY (tenant_id, budget_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.budget_transaction
        ADD CONSTRAINT fk_btr_commitment
            FOREIGN KEY (tenant_id, commitment_id)
                REFERENCES document.commitment (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.budget_transfer ───────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE ledger.budget_transfer
        ADD CONSTRAINT fk_btx_tenant
            FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.budget_transfer
        ADD CONSTRAINT fk_btx_from_allocation
            FOREIGN KEY (tenant_id, from_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.budget_transfer
        ADD CONSTRAINT fk_btx_to_allocation
            FOREIGN KEY (tenant_id, to_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.budget_transfer
        ADD CONSTRAINT fk_btx_from_txn
            FOREIGN KEY (tenant_id, from_txn_id)
                REFERENCES ledger.budget_transaction (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.budget_transfer
        ADD CONSTRAINT fk_btx_to_txn
            FOREIGN KEY (tenant_id, to_txn_id)
                REFERENCES ledger.budget_transaction (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.budget_balance ────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE ledger.budget_balance
        ADD CONSTRAINT fk_bb_allocation
            FOREIGN KEY (tenant_id, budget_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.budget_balance
        ADD CONSTRAINT fk_bb_last_txn
            FOREIGN KEY (tenant_id, last_txn_id)
                REFERENCES ledger.budget_transaction (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.planning_output ───────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE ledger.planning_output
        ADD CONSTRAINT fk_po_planning_model
            FOREIGN KEY (tenant_id, planning_model_id)
                REFERENCES master.planning_model (tenant_id, id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE ledger.planning_output
        ADD CONSTRAINT fk_po_formula
            FOREIGN KEY (formula_id)
                REFERENCES control.planning_driver_formula (id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Ledger FK constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.inventory_balance ─────────────────────────────────────────────────
ALTER TABLE ledger.inventory_balance DROP CONSTRAINT IF EXISTS ib_tenant_fk;
DO $$ BEGIN ALTER TABLE ledger.inventory_balance ADD CONSTRAINT ib_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_balance ADD CONSTRAINT ib_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_balance ADD CONSTRAINT ib_item_fk
    FOREIGN KEY (tenant_id, item_id) REFERENCES master.item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_balance ADD CONSTRAINT ib_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_balance ADD CONSTRAINT ib_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_balance ADD CONSTRAINT ib_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.inventory_movement ────────────────────────────────────────────────
ALTER TABLE ledger.inventory_movement DROP CONSTRAINT IF EXISTS im_tenant_fk;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_item_fk
    FOREIGN KEY (tenant_id, item_id) REFERENCES master.item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_source_warehouse_fk
    FOREIGN KEY (tenant_id, source_warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_dest_warehouse_fk
    FOREIGN KEY (tenant_id, dest_warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_reversal_of_fk
    FOREIGN KEY (tenant_id, reversal_of_id)
    REFERENCES ledger.inventory_movement (tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_performed_by_fk
    FOREIGN KEY (performed_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_posted_by_fk
    FOREIGN KEY (posted_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_movement ADD CONSTRAINT im_je_fk
    FOREIGN KEY (reference_je_id) REFERENCES document.journal_entry (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ledger.inventory_valuation_layer ─────────────────────────────────────────
ALTER TABLE ledger.inventory_valuation_layer DROP CONSTRAINT IF EXISTS ivl_tenant_fk;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_item_fk
    FOREIGN KEY (tenant_id, item_id) REFERENCES master.item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_warehouse_fk
    FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_receipt_movement_fk
    FOREIGN KEY (tenant_id, receipt_movement_id)
    REFERENCES ledger.inventory_movement (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ledger.inventory_valuation_layer ADD CONSTRAINT ivl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- IC ENGINE — Ledger FK constraints (consolidation_elimination enhancements)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_approval_chk
    CHECK (approval_route IN ('AUTO','STANDARD','ENHANCED','MANUAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE ledger.consolidation_elimination ADD CONSTRAINT ce_score_chk
    CHECK (decision_score IS NULL OR decision_score BETWEEN 0 AND 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
