-- 09_triggers/005_ledger.sql
-- Ledger schema triggers.
-- Depends on: 04_tables/005_ledger.sql, 08_functions/001_shared

-- =============================================================================
-- §  ledger.gl_balance
-- =============================================================================

DROP TRIGGER IF EXISTS trg_glb_updated_at ON ledger.gl_balance;
CREATE TRIGGER trg_glb_updated_at BEFORE UPDATE ON ledger.gl_balance
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §  ledger.asset_revaluation_reserve (immutable — append-only)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_arr_prevent_mutation ON ledger.asset_revaluation_reserve;
CREATE TRIGGER trg_arr_prevent_mutation
    BEFORE UPDATE OR DELETE ON ledger.asset_revaluation_reserve
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_arr_reserve_type_lookup ON ledger.asset_revaluation_reserve;
CREATE TRIGGER trg_arr_reserve_type_lookup
    BEFORE INSERT OR UPDATE OF reserve_type ON ledger.asset_revaluation_reserve
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_reserve_type', 'reserve_type');

DROP TRIGGER IF EXISTS trg_arr_book_type_lookup ON ledger.asset_revaluation_reserve;
CREATE TRIGGER trg_arr_book_type_lookup
    BEFORE INSERT OR UPDATE OF book_type ON ledger.asset_revaluation_reserve
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('master.asset_book_type', 'book_type');


-- =============================================================================
-- §  TAX + FX ENGINE — Immutability guards (append-only ledger tables)
-- All three tables use the shared log.trg_prevent_mutation() trigger function.
-- =============================================================================

-- ── ledger.tax_calculation (fully append-only) ────────────────────────────────
DROP TRIGGER IF EXISTS trg_tc_immutable ON ledger.tax_calculation;
CREATE TRIGGER trg_tc_immutable
    BEFORE UPDATE OR DELETE ON ledger.tax_calculation
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- ── ledger.tax_credit_movement (fully append-only) ───────────────────────────
DROP TRIGGER IF EXISTS trg_tcm_immutable ON ledger.tax_credit_movement;
CREATE TRIGGER trg_tcm_immutable
    BEFORE UPDATE OR DELETE ON ledger.tax_credit_movement
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- ── ledger.fx_revaluation_line (immutable — new run required to correct) ──────
DROP TRIGGER IF EXISTS trg_fxrl_immutable ON ledger.fx_revaluation_line;
CREATE TRIGGER trg_fxrl_immutable
    BEFORE UPDATE OR DELETE ON ledger.fx_revaluation_line
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Ledger triggers
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ledger.inventory_balance ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ib_updated_at ON ledger.inventory_balance;
CREATE TRIGGER trg_ib_updated_at
    BEFORE UPDATE ON ledger.inventory_balance
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ib_company_guard ON ledger.inventory_balance;
CREATE TRIGGER trg_ib_company_guard
    BEFORE INSERT OR UPDATE OF company_code_id, item_id, warehouse_id
    ON ledger.inventory_balance
    FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_inventory_company_consistency();

-- ── ledger.inventory_movement ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_im_company_guard ON ledger.inventory_movement;
CREATE TRIGGER trg_im_company_guard
    BEFORE INSERT ON ledger.inventory_movement
    FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_inventory_company_consistency();

-- ── ledger.inventory_valuation_layer ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ivl_updated_at ON ledger.inventory_valuation_layer;
CREATE TRIGGER trg_ivl_updated_at
    BEFORE UPDATE ON ledger.inventory_valuation_layer
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ivl_company_guard ON ledger.inventory_valuation_layer;
CREATE TRIGGER trg_ivl_company_guard
    BEFORE INSERT OR UPDATE OF company_code_id, item_id, warehouse_id
    ON ledger.inventory_valuation_layer
    FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_inventory_company_consistency();
