-- ============================================================================
-- 07_indexes/004a_document_payment_terms.sql
-- PAYMENT TERMS - document schema indexes
-- Covers:   document.payment_term_application indexes
--           document.payment_term_discount_result indexes
-- Depends:  04_tables/004a_document_payment_terms.sql
-- ============================================================================

-- ============================================================================
-- Application indexes
-- ============================================================================

-- pta: all applications for an invoice
CREATE INDEX IF NOT EXISTS pta_invoice_idx
    ON document.payment_term_application (invoice_id);

-- pta: commitment + clause lookup (deduction evaluation)
CREATE INDEX IF NOT EXISTS pta_commitment_clause_idx
    ON document.payment_term_application (commitment_id, clause_code)
    WHERE is_effective = true;

-- pta: cumulative running totals per commitment Ã— clause_code (FIX-6)
CREATE INDEX IF NOT EXISTS pta_commitment_cumulative_idx
    ON document.payment_term_application (commitment_id, clause_code, evaluation_sequence_no)
    WHERE is_effective = true;


-- ============================================================================
-- Discount Result indexes
-- ============================================================================

-- ptdr: all discount results for a payment
CREATE INDEX IF NOT EXISTS ptdr_payment_idx
    ON document.payment_term_discount_result (payment_id);

-- ptdr: all discount results for an invoice
CREATE INDEX IF NOT EXISTS ptdr_invoice_idx
    ON document.payment_term_discount_result (invoice_id);
