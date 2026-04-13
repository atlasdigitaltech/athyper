-- =============================================================================
-- 09_triggers/004b_document_p2p.sql  –  Triggers for P2P tables
-- =============================================================================
-- Five triggers wiring the guard functions from 08_functions/004b_document_p2p.sql.
-- Pattern: DROP IF EXISTS + CREATE (idempotent re-runs).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.1  GR header company consistency
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_gr_company_guard ON document.goods_receipt;
CREATE TRIGGER trg_gr_company_guard
    BEFORE INSERT OR UPDATE OF company_code_id, receiving_warehouse_id, receiving_site_id
    ON document.goods_receipt
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_gr_header_company();

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.2  GR line company consistency (item + warehouse must match header)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_grl_company_guard ON document.goods_receipt_line;
CREATE TRIGGER trg_grl_company_guard
    BEFORE INSERT OR UPDATE OF item_id, warehouse_id
    ON document.goods_receipt_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_gr_line_company();

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.3  Commitment line company consistency (item + delivery warehouse/site)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cl_company_guard ON document.commitment_line;
CREATE TRIGGER trg_cl_company_guard
    BEFORE INSERT OR UPDATE OF item_id, delivery_warehouse_id, delivery_site_id
    ON document.commitment_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_commitment_line_company();

-- ─────────────────────────────────────────────────────────────────────────────
-- §15.4  SES line company consistency (item must match SES company)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sesl_company_guard ON document.service_entry_sheet_line;
CREATE TRIGGER trg_sesl_company_guard
    BEFORE INSERT OR UPDATE OF item_id
    ON document.service_entry_sheet_line
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_ses_line_company();

-- ─────────────────────────────────────────────────────────────────────────────
-- §16  Payment allocation business-rule guard  (per-row)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_pea_allocation_guard ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_allocation_guard
    BEFORE INSERT OR UPDATE OF payment_entry_id, purchase_invoice_id, commitment_id,
                               advance_recovery_amount, retention_amount
    ON document.payment_entry_allocation
    FOR EACH ROW
    EXECUTE FUNCTION document.trg_guard_payment_allocation();

-- ─────────────────────────────────────────────────────────────────────────────
-- §16b  NETTING minimum allocation count guard  (after statement)
-- ─────────────────────────────────────────────────────────────────────────────
-- Runs after the full INSERT/UPDATE statement so it can see the complete set of
-- sibling rows for the affected payment_entry_id(s).
DROP TRIGGER IF EXISTS trg_pea_netting_count_guard_ins ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_netting_count_guard_ins
    AFTER INSERT
    ON document.payment_entry_allocation
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION document.trg_guard_netting_allocation_count();

DROP TRIGGER IF EXISTS trg_pea_netting_count_guard_upd ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_netting_count_guard_upd
    AFTER UPDATE
    ON document.payment_entry_allocation
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT
    EXECUTE FUNCTION document.trg_guard_netting_allocation_count();
