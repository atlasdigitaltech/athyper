-- ============================================================================
-- document/03e_constraints_drop_legacy.sql
-- Concept: HF-6 — Drop legacy single-column bank FK
-- Depends on: 03b_constraints_ap_closure.sql (created tenant-composite pe_bsl_fk)
-- Spec: Hardening Sprint H-Fix §HF-6
--
-- After 03b widened payment_entry.bank_statement_line_id to a tenant-composite
-- FK named pe_bsl_fk, the legacy single-column FK pe_bank_stmt_line_fk continued
-- to exist (both constraints were live in athyper_neon). Dropping it now leaves
-- the composite as the sole FK.
-- ============================================================================

ALTER TABLE document.payment_entry DROP CONSTRAINT IF EXISTS pe_bank_stmt_line_fk;


-- =============================================================================
-- End of 03e_constraints_drop_legacy.sql
-- =============================================================================
