-- ============================================================================
-- 09_triggers/004a_document_payment_terms.sql
-- PAYMENT TERMS - document schema triggers
-- Covers:   document.payment_term_application updated_at trigger
-- Depends:  04_tables/004a_document_payment_terms.sql
-- ============================================================================

-- payment_term_application
DROP TRIGGER IF EXISTS trg_pta_updated_at ON document.payment_term_application;
CREATE TRIGGER trg_pta_updated_at BEFORE UPDATE ON document.payment_term_application
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

