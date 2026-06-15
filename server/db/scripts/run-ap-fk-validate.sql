-- ============================================================================
-- server/db/scripts/run-ap-fk-validate.sql
-- Concept: OPERATOR-ONLY VALIDATE pass for the 23 AP FKs added in 03b + 03f
-- Spec: AP Schema Hardening Plan §H1, Hardening Sprint H-Fix-2 §HF2-4
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OPERATOR-ONLY. NOT auto-run by provision.ts.
-- ─────────────────────────────────────────────────────────────────────────────
-- This file lives outside server/db/ddl/ on purpose. provision.ts recursively
-- collects every .sql under db/ddl and would run VALIDATE blindly during phase
-- 60 — which fails on any pre-existing orphan and aborts the deploy.
--
-- Workflow:
--   1. Run the orphan pre-check:
--        npx tsx server/scripts/verify-ap-fk-orphans.ts
--   2. If 0 orphans reported, apply VALIDATE:
--        psql "$DATABASE_URL" -f server/db/scripts/run-ap-fk-validate.sql
--   3. If orphans found, triage them (delete / archive / reparent) and re-run
--      step 1 before step 2. A failed VALIDATE leaves the constraint NOT VALID.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- 23 VALIDATE statements (20 new + 2 widened to composite + 1 reshape via 03f).
