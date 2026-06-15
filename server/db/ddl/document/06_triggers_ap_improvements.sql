-- ============================================================================
-- document/06_triggers_ap_improvements.sql
-- Concept: HF2-3 — Attach trigger functions defined in 05_functions_ap_improvements.sql
-- Depends on: 05_functions_ap_improvements.sql, target tables
-- Spec: Hardening Sprint H-Fix-2 §HF2-3, §HF2-5
--
-- Trigger attachments split out from 01z_ap_h4_improvements.sql to align with
-- provisioner phase order. 01z stays as a header-only stub for traceability.
-- ============================================================================


-- §B  Match case rollup trigger (HF-7 active filter)
DROP TRIGGER IF EXISTS trg_imc_rollup_exceptions ON document.match_exception;
CREATE TRIGGER trg_imc_rollup_exceptions
    AFTER INSERT OR UPDATE OR DELETE ON document.match_exception
    FOR EACH ROW EXECUTE FUNCTION document.fn_imc_rollup_exceptions();


-- §C  Over-allocation guard on PEA INSERT (HF2-5 revised — PE-status check FIRST)
DROP TRIGGER IF EXISTS trg_pea_no_over_allocation ON document.payment_entry_allocation;
CREATE CONSTRAINT TRIGGER trg_pea_no_over_allocation
    AFTER INSERT ON document.payment_entry_allocation
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION document.fn_pea_no_over_allocation();


-- §D  BRCL active-match uniqueness (HF-3 advisory lock preserved)
DROP TRIGGER IF EXISTS trg_brcl_active_uniqueness ON document.bank_recon_case_line;
CREATE TRIGGER trg_brcl_active_uniqueness
    BEFORE INSERT ON document.bank_recon_case_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_brcl_active_uniqueness();


-- §E  Payment amount reconciliation (HF2-3 — fires on cash-effective transition)
-- WHEN clause uses fn_pe_cash_effective so the trigger only fires when the
-- payment moves to posted / transmitted / printed / cleared.
DROP TRIGGER IF EXISTS trg_payment_amount_reconciliation ON document.payment_entry;
CREATE CONSTRAINT TRIGGER trg_payment_amount_reconciliation
    AFTER UPDATE OF status ON document.payment_entry
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (document.fn_pe_cash_effective(NEW.status, NEW.is_voided) = true
          AND document.fn_pe_cash_effective(OLD.status, OLD.is_voided) = false)
    EXECUTE FUNCTION document.fn_payment_amount_reconciliation();


-- §F  PE status transition over-allocation check (HF-2 revised — uses predicates)
DROP TRIGGER IF EXISTS trg_pe_status_overalloc_check ON document.payment_entry;
CREATE CONSTRAINT TRIGGER trg_pe_status_overalloc_check
    AFTER UPDATE OF status ON document.payment_entry
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION document.fn_pe_status_transition_overalloc_check();


-- =============================================================================
-- End of 06_triggers_ap_improvements.sql
-- =============================================================================
