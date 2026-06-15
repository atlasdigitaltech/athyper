-- ============================================================================
-- document/06x_ap_append_only_triggers.sql
-- Concept: H2.A — Append-only mutation prevention for AP audit/event tables
-- Depends on: log.trg_prevent_mutation() (existing)
-- Spec: AP Schema Hardening Plan §H2.A
--
-- Tables marked SUBTYPE=APPEND_ONLY in their COMMENT must enforce that at the
-- DB level via log.trg_prevent_mutation(). The earlier audit found that 7 AP
-- tables had append-only documentation but no enforcement trigger:
--   • invoice_party_snapshot
--   • invoice_address_snapshot
--   • invoice_bank_snapshot
--   • invoice_tax_snapshot
--   • payment_entry_allocation
--   • payment_term_discount_result
--   • bank_recon_case_line
--
-- log.trg_prevent_mutation() raises an exception on UPDATE or DELETE. Inserts
-- pass through. Reversal pattern: insert a new row with is_reversal=true or
-- by voiding the parent case (BRCL/recon).
-- ============================================================================


-- §1  invoice_party_snapshot
DROP TRIGGER IF EXISTS trg_ipsnap_immutable ON document.invoice_party_snapshot;
CREATE TRIGGER trg_ipsnap_immutable
    BEFORE UPDATE OR DELETE ON document.invoice_party_snapshot
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- §2  invoice_address_snapshot
DROP TRIGGER IF EXISTS trg_iasnap_immutable ON document.invoice_address_snapshot;
CREATE TRIGGER trg_iasnap_immutable
    BEFORE UPDATE OR DELETE ON document.invoice_address_snapshot
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- §3  invoice_bank_snapshot
DROP TRIGGER IF EXISTS trg_ibsnap_immutable ON document.invoice_bank_snapshot;
CREATE TRIGGER trg_ibsnap_immutable
    BEFORE UPDATE OR DELETE ON document.invoice_bank_snapshot
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- §4  invoice_tax_snapshot
DROP TRIGGER IF EXISTS trg_itsnap_immutable ON document.invoice_tax_snapshot;
CREATE TRIGGER trg_itsnap_immutable
    BEFORE UPDATE OR DELETE ON document.invoice_tax_snapshot
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- §5  payment_entry_allocation
-- The CASCADE FK pea_payment_fk (H1) would attempt to CASCADE DELETE allocations
-- if the parent payment is deleted. Append-only protection blocks both manual
-- UPDATE/DELETE AND that cascade — payment_entry should never be hard-deleted;
-- voiding via is_voided is the correct path.
DROP TRIGGER IF EXISTS trg_pea_immutable ON document.payment_entry_allocation;
CREATE TRIGGER trg_pea_immutable
    BEFORE UPDATE OR DELETE ON document.payment_entry_allocation
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- §6  payment_term_discount_result
DROP TRIGGER IF EXISTS trg_ptdr_immutable ON document.payment_term_discount_result;
CREATE TRIGGER trg_ptdr_immutable
    BEFORE UPDATE OR DELETE ON document.payment_term_discount_result
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

-- §7  bank_recon_case_line
DROP TRIGGER IF EXISTS trg_brcl_immutable ON document.bank_recon_case_line;
CREATE TRIGGER trg_brcl_immutable
    BEFORE UPDATE OR DELETE ON document.bank_recon_case_line
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();


-- =============================================================================
-- End of 06x_ap_append_only_triggers.sql
-- =============================================================================
