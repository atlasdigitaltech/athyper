-- ============================================================================
-- document/03c_constraints_ap_validate.sql
-- Concept: H1 — VALIDATE pass for FKs added in 03b
-- Depends on: 03b_constraints_ap_closure.sql
-- Spec: AP Schema Hardening Plan §H1
--
-- Run ONLY after server/scripts/verify-ap-fk-orphans.ts returns zero orphans.
-- If pre-check finds orphans, triage them (delete / archive / reparent) before
-- attempting VALIDATE. A failed VALIDATE leaves the constraint NOT VALID.
-- ============================================================================

ALTER TABLE document.purchase_invoice_line          VALIDATE CONSTRAINT pil_invoice_fk;

ALTER TABLE document.invoice_party_snapshot         VALIDATE CONSTRAINT ipsnap_pi_fk;
ALTER TABLE document.invoice_address_snapshot       VALIDATE CONSTRAINT iasnap_pi_fk;
ALTER TABLE document.invoice_bank_snapshot          VALIDATE CONSTRAINT ibsnap_pi_fk;
ALTER TABLE document.invoice_tax_snapshot           VALIDATE CONSTRAINT itsnap_pi_fk;
ALTER TABLE document.invoice_tax_snapshot           VALIDATE CONSTRAINT itsnap_pil_fk;

ALTER TABLE document.invoice_match_case             VALIDATE CONSTRAINT imc_invoice_fk;
ALTER TABLE document.match_exception                VALIDATE CONSTRAINT imx_case_fk;
ALTER TABLE document.match_exception                VALIDATE CONSTRAINT imx_pil_fk;

ALTER TABLE document.payment_term_application       VALIDATE CONSTRAINT pta_invoice_fk;
ALTER TABLE document.payment_term_application       VALIDATE CONSTRAINT pta_invoice_line_fk;

ALTER TABLE document.payment_entry_allocation       VALIDATE CONSTRAINT pea_payment_fk;
ALTER TABLE document.payment_entry_allocation       VALIDATE CONSTRAINT pea_invoice_fk;
ALTER TABLE document.payment_entry_allocation       VALIDATE CONSTRAINT pea_pta_fk;

ALTER TABLE document.payment_remittance_output      VALIDATE CONSTRAINT prem_payment_fk;
ALTER TABLE document.payment_term_discount_result   VALIDATE CONSTRAINT ptdr_payment_fk;
ALTER TABLE document.payment_term_discount_result   VALIDATE CONSTRAINT ptdr_invoice_fk;

ALTER TABLE document.journal_line                   VALIDATE CONSTRAINT jl_je_fk;
ALTER TABLE document.journal_line_reference         VALIDATE CONSTRAINT jlr_jl_fk;

ALTER TABLE document.accounting_distribution_resolution_audit VALIDATE CONSTRAINT ad_resolution_audit_ad_fk;
ALTER TABLE document.accounting_distribution_resolution_audit VALIDATE CONSTRAINT ad_resolution_audit_gl_fk;

ALTER TABLE document.payment_entry                  VALIDATE CONSTRAINT pe_bsl_fk;
ALTER TABLE document.bank_statement_line            VALIDATE CONSTRAINT bsl_recon_case_fk;

-- 22 VALIDATE statements (20 new + 2 widened to composite).
