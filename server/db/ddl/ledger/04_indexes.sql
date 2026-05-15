-- ============================================================================
-- ledger/04_indexes.sql
-- Concept: Ledger Indexes — GL account, posting date, and balance query performance
-- Depends on: 04_tables/005_ledger.sql
-- Naming: <table>_<cols>_idx | _uq (unique) | _pidx (partial WHERE).
-- ============================================================================

-- ── ledger.gl_balance ───────────────────────────────────────────────────────

-- UPSERT uniqueness constraint — sentinel UUID (all-zeros) for nullable dimension columns
-- Cannot be a table-level UNIQUE constraint because COALESCE expressions require a functional index.
CREATE UNIQUE INDEX IF NOT EXISTS gl_balance_composite_uq ON ledger.gl_balance (
    tenant_id,
    company_code_id,
    gl_account_id,
    book_id,
    fiscal_year,
    period_number,
    currency_code,
    COALESCE(cost_center_id,    '00000000-0000-0000-0000-000000000000'),
    COALESCE(profit_center_id,  '00000000-0000-0000-0000-000000000000'),
    COALESCE(project_id,        '00000000-0000-0000-0000-000000000000'),
    COALESCE(dimension_set_id,  '00000000-0000-0000-0000-000000000000')
);

CREATE INDEX IF NOT EXISTS glb_company_account_idx ON ledger.gl_balance (tenant_id, company_code_id, gl_account_id);
CREATE INDEX IF NOT EXISTS glb_book_period_idx     ON ledger.gl_balance (tenant_id, company_code_id, book_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS glb_cc_idx              ON ledger.gl_balance (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS glb_pc_idx              ON ledger.gl_balance (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS glb_project_idx         ON ledger.gl_balance (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS glb_dimset_idx          ON ledger.gl_balance (tenant_id, dimension_set_id) WHERE dimension_set_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET MANAGEMENT MODULE — Indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.asset_revaluation_reserve ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS arr_asset_book_idx    ON ledger.asset_revaluation_reserve (tenant_id, asset_id, book_type);
CREATE INDEX IF NOT EXISTS arr_company_idx       ON ledger.asset_revaluation_reserve (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS arr_period_idx        ON ledger.asset_revaluation_reserve (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS arr_txn_idx           ON ledger.asset_revaluation_reserve (tenant_id, asset_transaction_id);
-- Supports v_asset_reserve_summary: latest balance per (asset, book, currency)
CREATE INDEX IF NOT EXISTS arr_latest_balance_idx
    ON ledger.asset_revaluation_reserve (tenant_id, asset_id, asset_book_id, currency_code, posted_at DESC, id DESC);


-- ── ledger.tax_calculation ───────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS tc_idempotency_uq
    ON ledger.tax_calculation (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS tc_doc_idx
    ON ledger.tax_calculation (tenant_id, doc_type, doc_id);
CREATE INDEX IF NOT EXISTS tc_book_period_idx
    ON ledger.tax_calculation (tenant_id, book_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS tc_jurisdiction_period_idx
    ON ledger.tax_calculation (tenant_id, jurisdiction_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS tc_wht_pidx
    ON ledger.tax_calculation (tenant_id, company_code_id, fiscal_year, period_number)
    WHERE is_wht = true;

-- ── ledger.tax_credit_movement ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tcm_period_idx
    ON ledger.tax_credit_movement (tenant_id, company_code_id, jurisdiction_id, tax_type_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS tcm_source_calc_pidx
    ON ledger.tax_credit_movement (source_tax_calculation_id)
    WHERE source_tax_calculation_id IS NOT NULL;

-- ── ledger.fx_revaluation_line ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS fxrl_run_idx
    ON ledger.fx_revaluation_line (tenant_id, run_id);
CREATE INDEX IF NOT EXISTS fxrl_account_idx
    ON ledger.fx_revaluation_line (tenant_id, gl_account_id);
CREATE INDEX IF NOT EXISTS fxrl_source_pidx
    ON ledger.fx_revaluation_line (source_entity_type, source_entity_id)
    WHERE source_entity_id IS NOT NULL;

-- ── ledger.consolidation_elimination ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ce_period_idx
    ON ledger.consolidation_elimination (tenant_id, company_code_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS ce_source_dest_idx
    ON ledger.consolidation_elimination (source_company_code_id, dest_company_code_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Ledger indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.commitment_schedule ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cs_commitment      ON ledger.commitment_schedule (commitment_id);
CREATE INDEX IF NOT EXISTS idx_cs_due             ON ledger.commitment_schedule (due_date, status)
    WHERE status IN ('pending','partially_fulfilled');
CREATE INDEX IF NOT EXISTS idx_cs_allocation      ON ledger.commitment_schedule (budget_allocation_id)
    WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cs_fiscal          ON ledger.commitment_schedule (fiscal_year, period_number);

-- ── ledger.commitment_fulfillment ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cf_commitment      ON ledger.commitment_fulfillment (commitment_id);
CREATE INDEX IF NOT EXISTS idx_cf_schedule        ON ledger.commitment_fulfillment (schedule_id)
    WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_ref_doc         ON ledger.commitment_fulfillment (reference_doc_id)
    WHERE reference_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_fiscal          ON ledger.commitment_fulfillment (fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_cf_reversal        ON ledger.commitment_fulfillment (reverses_id)
    WHERE reverses_id IS NOT NULL;

-- ── ledger.budget_transaction ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_btr_allocation     ON ledger.budget_transaction (budget_allocation_id);
CREATE INDEX IF NOT EXISTS idx_btr_commitment     ON ledger.budget_transaction (commitment_id)
    WHERE commitment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_btr_tenant         ON ledger.budget_transaction (tenant_id);
CREATE INDEX IF NOT EXISTS idx_btr_fiscal         ON ledger.budget_transaction (budget_allocation_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_btr_idempotency    ON ledger.budget_transaction (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_btr_expires        ON ledger.budget_transaction (expires_at)
    WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_btr_source_doc     ON ledger.budget_transaction (source_doc_id)
    WHERE source_doc_id IS NOT NULL;

-- ── ledger.budget_transfer ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_btx_from           ON ledger.budget_transfer (from_allocation_id);
CREATE INDEX IF NOT EXISTS idx_btx_to             ON ledger.budget_transfer (to_allocation_id);
CREATE INDEX IF NOT EXISTS idx_btx_tenant         ON ledger.budget_transfer (tenant_id);
CREATE INDEX IF NOT EXISTS idx_btx_status         ON ledger.budget_transfer (tenant_id, status)
    WHERE status NOT IN ('completed','reversed','rejected');

-- ── ledger.budget_balance ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bb_allocation      ON ledger.budget_balance (budget_allocation_id);
CREATE INDEX IF NOT EXISTS idx_bb_fiscal          ON ledger.budget_balance (budget_allocation_id, fiscal_year);

-- ── ledger.planning_output ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_po_model           ON ledger.planning_output (planning_model_id);
CREATE INDEX IF NOT EXISTS idx_po_account         ON ledger.planning_output (gl_account_id)
    WHERE gl_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_fiscal          ON ledger.planning_output (planning_model_id, fiscal_year, period_number);
CREATE INDEX IF NOT EXISTS idx_po_formula         ON ledger.planning_output (formula_id)
    WHERE formula_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_approved        ON ledger.planning_output (planning_model_id, is_approved)
    WHERE is_approved = true;

-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Ledger indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.inventory_balance ─────────────────────────────────────────────────
-- Natural key uniqueness via four partial unique indexes (NULL lot/serial handling).
CREATE UNIQUE INDEX IF NOT EXISTS ib_position_uq
    ON ledger.inventory_balance (tenant_id, company_code_id, item_id, warehouse_id)
    WHERE lot_number IS NULL AND serial_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ib_position_lot_uq
    ON ledger.inventory_balance (tenant_id, company_code_id, item_id, warehouse_id, lot_number)
    WHERE lot_number IS NOT NULL AND serial_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ib_position_serial_uq
    ON ledger.inventory_balance (tenant_id, company_code_id, item_id, warehouse_id, serial_number)
    WHERE lot_number IS NULL AND serial_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ib_position_lot_serial_uq
    ON ledger.inventory_balance (tenant_id, company_code_id, item_id, warehouse_id, lot_number, serial_number)
    WHERE lot_number IS NOT NULL AND serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS ib_item_idx
    ON ledger.inventory_balance (tenant_id, company_code_id, item_id);
CREATE INDEX IF NOT EXISTS ib_warehouse_idx
    ON ledger.inventory_balance (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS ib_reorder_pidx
    ON ledger.inventory_balance (tenant_id, company_code_id, item_id)
    WHERE quantity_on_hand <= 0;

-- ── ledger.inventory_movement ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS im_item_warehouse_idx
    ON ledger.inventory_movement (tenant_id, item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS im_reference_doc_idx
    ON ledger.inventory_movement (tenant_id, ref_doc_type, ref_doc_id)
    WHERE ref_doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS im_performed_at_idx
    ON ledger.inventory_movement (tenant_id, company_code_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS im_unposted_pidx
    ON ledger.inventory_movement (tenant_id, company_code_id)
    WHERE posted_at IS NULL;
CREATE INDEX IF NOT EXISTS im_reversal_idx
    ON ledger.inventory_movement (tenant_id, reversal_of_id)
    WHERE reversal_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS im_je_idx
    ON ledger.inventory_movement (tenant_id, reference_je_id)
    WHERE reference_je_id IS NOT NULL;

-- ── ledger.inventory_valuation_layer ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ivl_open_layers_pidx
    ON ledger.inventory_valuation_layer (tenant_id, item_id, warehouse_id, layer_date ASC)
    WHERE is_consumed = false;
CREATE INDEX IF NOT EXISTS ivl_item_warehouse_idx
    ON ledger.inventory_valuation_layer (tenant_id, item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS ivl_receipt_movement_idx
    ON ledger.inventory_valuation_layer (tenant_id, receipt_movement_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- IC ENGINE — Ledger indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.ic_elimination_line ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS icel_elimination_idx
    ON ledger.ic_elimination_line (tenant_id, elimination_id);
CREATE INDEX IF NOT EXISTS icel_gl_account_idx
    ON ledger.ic_elimination_line (tenant_id, gl_account_id, fiscal_year, period_number);

-- ── ledger.consolidation_elimination (IC enhancements) ──────────────────────
CREATE INDEX IF NOT EXISTS ce_ic_elimination_idx
    ON ledger.consolidation_elimination (tenant_id, ic_elimination_id)
    WHERE ic_elimination_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ce_consol_group_idx
    ON ledger.consolidation_elimination (tenant_id, consolidation_group, fiscal_year, period_number)
    WHERE consolidation_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS ce_approval_queue_idx
    ON ledger.consolidation_elimination (tenant_id, approval_route, status)
    WHERE status = 'calculated' AND approval_route IN ('ENHANCED','MANUAL');
