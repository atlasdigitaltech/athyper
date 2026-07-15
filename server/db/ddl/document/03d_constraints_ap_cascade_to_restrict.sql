-- ============================================================================
-- document/03d_constraints_ap_cascade_to_restrict.sql
-- Concept: HF-4 — Convert CASCADE FKs to RESTRICT where children are immutable
-- Depends on: 03b_constraints_ap_closure.sql (FK creation),
--             06x_ap_append_only_triggers.sql (mutation prevention)
-- Spec: Hardening Sprint H-Fix §HF-4
--
-- ON DELETE CASCADE declares "delete this row when the parent deletes." But
-- the H2 append-only triggers (BEFORE DELETE → log.trg_prevent_mutation) reject
-- the cascaded delete. The declared semantics differ from actual behavior.
--
-- Fix: change FKs whose children are append-only to ON DELETE RESTRICT, so the
-- DDL accurately expresses "parent cannot be deleted while immutable child
-- exists." This makes the failure mode visible to consumers earlier (the FK
-- error is clearer than a trigger error during cascade).
--
-- Affected FKs (5):
--   itsnap_pi_fk         (invoice_tax_snapshot)
--   itsnap_pil_fk        (invoice_tax_snapshot, was SET NULL — also conflicts)
--   pea_payment_fk       (payment_entry_allocation)
--   ptdr_payment_fk      (payment_term_discount_result)
--   jlr_jl_fk            (journal_line_reference)
--
-- Identity now uses direct document header fields and live master joins; the
-- legacy identity-snapshot FKs were removed with those tables.
--
-- Unaffected (children are mutable):
--   pil_invoice_fk, imc_invoice_fk, imx_case_fk, imx_pil_fk,
--   pta_invoice_fk, pta_invoice_line_fk, pea_invoice_fk, pea_pta_fk,
--   prem_payment_fk, ptdr_invoice_fk, jl_je_fk, pe_bsl_fk, bsl_recon_case_fk
-- ============================================================================

-- §1  Invoice tax snapshot → PI : CASCADE → RESTRICT
-- (Phase D.4 dropped the three legacy identity snapshots and their FKs.)
DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot DROP CONSTRAINT IF EXISTS itsnap_pi_fk;
    ALTER TABLE document.invoice_tax_snapshot
        ADD CONSTRAINT itsnap_pi_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §2  Tax snapshot PIL link: was SET NULL (col-scoped), changes to RESTRICT
-- The SET NULL is the same conflict — tax snapshot is immutable, so the
-- column-scoped NULL update is blocked by trg_itsnap_immutable.
DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot DROP CONSTRAINT IF EXISTS itsnap_pil_fk;
    ALTER TABLE document.invoice_tax_snapshot
        ADD CONSTRAINT itsnap_pil_fk
        FOREIGN KEY (tenant_id, invoice_line_id)
        REFERENCES document.purchase_invoice_line (tenant_id, id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §3  PEA → PE: CASCADE → RESTRICT (PEA is append-only)
DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation DROP CONSTRAINT IF EXISTS pea_payment_fk;
    ALTER TABLE document.payment_entry_allocation
        ADD CONSTRAINT pea_payment_fk
        FOREIGN KEY (tenant_id, payment_entry_id)
        REFERENCES document.payment_entry (tenant_id, id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §4  PTDR → PE: CASCADE → RESTRICT (PTDR is append-only)
DO $$ BEGIN
    ALTER TABLE document.payment_term_discount_result DROP CONSTRAINT IF EXISTS ptdr_payment_fk;
    ALTER TABLE document.payment_term_discount_result
        ADD CONSTRAINT ptdr_payment_fk
        FOREIGN KEY (tenant_id, payment_id)
        REFERENCES document.payment_entry (tenant_id, id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- §5  JLR → JL: CASCADE → RESTRICT (JLR is append-only per existing trigger)
DO $$ BEGIN
    ALTER TABLE document.journal_line_reference DROP CONSTRAINT IF EXISTS jlr_jl_fk;
    ALTER TABLE document.journal_line_reference
        ADD CONSTRAINT jlr_jl_fk
        FOREIGN KEY (tenant_id, journal_line_id)
        REFERENCES document.journal_line (tenant_id, id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- End of 03d_constraints_ap_cascade_to_restrict.sql
-- =============================================================================
-- The original 03b_constraints_ap_closure.sql is also patched in-source so a
-- clean re-deploy uses RESTRICT from the start. This file handles already-
-- deployed environments where the FKs are CASCADE.
-- =============================================================================
