-- ============================================================================
-- document/03b_constraints_ap_closure.sql
-- Concept: H1 — AP Foreign Key Closure (v1.2 hardening)
-- Depends on: 03_constraints.sql, 01e/01f/01b/01p/01t/01u DDL
-- Spec: AP Schema Hardening Plan §H1
--
-- Adds the 20 missing AP FKs flagged in the schema review. Every constraint
-- is added NOT VALID so deployment does not block on existing orphan rows.
-- Pre-check script: server/scripts/verify-ap-fk-orphans.ts
-- VALIDATE statements live in 03c_constraints_ap_validate.sql so the operator
-- can VALIDATE selectively after each pre-check pass.
--
-- Column names verified against live schema:
--   match_exception.invoice_match_case_id / invoice_line_id
--   payment_entry_allocation.purchase_invoice_id (not invoice_id)
--   payment_term_discount_result.payment_id / invoice_id
--   invoice_tax_snapshot.invoice_line_id (nullable)
--
-- All FKs are tenant-scoped composite (tenant_id, X) → (tenant_id, id) to
-- prevent cross-tenant linkage under RLS bypass.
-- ============================================================================


-- =============================================================================
-- §1  purchase_invoice_line → purchase_invoice
-- =============================================================================
DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §2  Invoice tax snapshot → PI / PIL
-- HF-4: snapshots are append-only (06x triggers) so CASCADE conflicts with
-- immutability. Use RESTRICT so the DDL expresses the intent: "PI cannot be
-- deleted while a snapshot exists." This makes the failure mode clearer than
-- a trigger-rejected cascade.
--
-- Identity now uses direct document header fields and live master joins; the
-- legacy invoice identity snapshot FK closure was removed with those tables.
-- =============================================================================
DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot
        ADD CONSTRAINT itsnap_pi_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HF-4: invoice_tax_snapshot is append-only — column-scoped SET NULL would
-- still trigger the immutability check. Use RESTRICT instead so PIL delete is
-- blocked outright (which matches the immutable-child semantic).
DO $$ BEGIN
    ALTER TABLE document.invoice_tax_snapshot
        ADD CONSTRAINT itsnap_pil_fk
        FOREIGN KEY (tenant_id, invoice_line_id)
        REFERENCES document.purchase_invoice_line (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §3  Match case + match exception
-- =============================================================================
DO $$ BEGIN
    ALTER TABLE document.invoice_match_case
        ADD CONSTRAINT imc_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- match_exception uses invoice_match_case_id (NOT match_case_id)
DO $$ BEGIN
    ALTER TABLE document.match_exception
        ADD CONSTRAINT imx_case_fk
        FOREIGN KEY (tenant_id, invoice_match_case_id)
        REFERENCES document.invoice_match_case (tenant_id, id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- match_exception line column is invoice_line_id (NOT purchase_invoice_line_id)
DO $$ BEGIN
    ALTER TABLE document.match_exception
        ADD CONSTRAINT imx_pil_fk
        FOREIGN KEY (tenant_id, invoice_line_id)
        REFERENCES document.purchase_invoice_line (tenant_id, id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §4  Payment term application → PI / PIL
-- =============================================================================
-- PTA uses invoice_id (not purchase_invoice_id) — verified against actual schema
DO $$ BEGIN
    ALTER TABLE document.payment_term_application
        ADD CONSTRAINT pta_invoice_fk
        FOREIGN KEY (tenant_id, invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PTA line link uses invoice_line_id (nullable) — column-scoped SET NULL if PG15+
DO $$ BEGIN
    ALTER TABLE document.payment_term_application
        ADD CONSTRAINT pta_invoice_line_fk
        FOREIGN KEY (tenant_id, invoice_line_id)
        REFERENCES document.purchase_invoice_line (tenant_id, id)
        ON DELETE SET NULL (invoice_line_id) NOT VALID;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN syntax_error THEN
        ALTER TABLE document.payment_term_application
            ADD CONSTRAINT pta_invoice_line_fk
            FOREIGN KEY (tenant_id, invoice_line_id)
            REFERENCES document.purchase_invoice_line (tenant_id, id)
            ON DELETE RESTRICT NOT VALID;
END $$;


-- =============================================================================
-- §5  Payment entry allocation → PE / PI / PTA
-- =============================================================================
-- HF-4: PEA is append-only (06x trigger); RESTRICT, not CASCADE.
DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation
        ADD CONSTRAINT pea_payment_fk
        FOREIGN KEY (tenant_id, payment_entry_id)
        REFERENCES document.payment_entry (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PEA uses purchase_invoice_id (NOT invoice_id) — verified
-- Nullable; ON DELETE RESTRICT (allocations should not silently outlive their invoice)
DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation
        ADD CONSTRAINT pea_invoice_fk
        FOREIGN KEY (tenant_id, purchase_invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HF2-2: PEA is append-only (06x trigger), so cascaded SET NULL would be
-- trigger-rejected. RESTRICT, not SET NULL.
DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation
        ADD CONSTRAINT pea_pta_fk
        FOREIGN KEY (tenant_id, payment_term_application_id)
        REFERENCES document.payment_term_application (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §6  Payment remittance output → PE
-- =============================================================================
DO $$ BEGIN
    ALTER TABLE document.payment_remittance_output
        ADD CONSTRAINT prem_payment_fk
        FOREIGN KEY (tenant_id, payment_entry_id)
        REFERENCES document.payment_entry (tenant_id, id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §7  Payment term discount result → PE / PI
-- =============================================================================
-- PTDR uses payment_id and invoice_id (NOT payment_entry_id / purchase_invoice_id)
-- HF-4: PTDR is append-only (06x trigger); RESTRICT, not CASCADE.
DO $$ BEGIN
    ALTER TABLE document.payment_term_discount_result
        ADD CONSTRAINT ptdr_payment_fk
        FOREIGN KEY (tenant_id, payment_id)
        REFERENCES document.payment_entry (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_term_discount_result
        ADD CONSTRAINT ptdr_invoice_fk
        FOREIGN KEY (tenant_id, invoice_id)
        REFERENCES document.purchase_invoice (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §8  Journal line + journal line reference
-- =============================================================================
DO $$ BEGIN
    ALTER TABLE document.journal_line
        ADD CONSTRAINT jl_je_fk
        FOREIGN KEY (tenant_id, journal_entry_id)
        REFERENCES document.journal_entry (tenant_id, id)
        ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HF-4: JLR is append-only (log.trg_prevent_mutation already attached); RESTRICT, not CASCADE.
DO $$ BEGIN
    ALTER TABLE document.journal_line_reference
        ADD CONSTRAINT jlr_jl_fk
        FOREIGN KEY (tenant_id, journal_line_id)
        REFERENCES document.journal_line (tenant_id, id)
        ON DELETE RESTRICT NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §10  Bank statement cross-tenant FK closure (H3 mirror)
-- =============================================================================
-- payment_entry.bank_statement_line_id was single-column FK; widen to composite.
-- HF-6: also drop the LEGACY name pe_bank_stmt_line_fk so it doesn't coexist
-- with the new pe_bsl_fk.
DO $$ BEGIN
    ALTER TABLE document.payment_entry DROP CONSTRAINT IF EXISTS pe_bsl_fk;
    ALTER TABLE document.payment_entry DROP CONSTRAINT IF EXISTS pe_bank_stmt_line_fk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry
        ADD CONSTRAINT pe_bsl_fk
        FOREIGN KEY (tenant_id, bank_statement_line_id)
        REFERENCES document.bank_statement_line (tenant_id, id)
        ON DELETE SET NULL (bank_statement_line_id) NOT VALID;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN syntax_error THEN
        ALTER TABLE document.payment_entry
            ADD CONSTRAINT pe_bsl_fk
            FOREIGN KEY (tenant_id, bank_statement_line_id)
            REFERENCES document.bank_statement_line (tenant_id, id)
            ON DELETE RESTRICT NOT VALID;
END $$;

-- bank_statement_line.recon_case_id — same pattern
DO $$ BEGIN
    ALTER TABLE document.bank_statement_line DROP CONSTRAINT IF EXISTS bsl_recon_case_fk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.bank_statement_line
        ADD CONSTRAINT bsl_recon_case_fk
        FOREIGN KEY (tenant_id, recon_case_id)
        REFERENCES document.bank_recon_case (tenant_id, id)
        ON DELETE SET NULL (recon_case_id) NOT VALID;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN syntax_error THEN
        ALTER TABLE document.bank_statement_line
            ADD CONSTRAINT bsl_recon_case_fk
            FOREIGN KEY (tenant_id, recon_case_id)
            REFERENCES document.bank_recon_case (tenant_id, id)
            ON DELETE RESTRICT NOT VALID;
END $$;


-- =============================================================================
-- §11  WHT source-line + tax-group FK closure (WS-A · Plan v2)
-- =============================================================================
-- purchase_invoice_line.withholding_tax_group_id is the legacy flat handle.
-- WS-COMPAT backfill writes pricing_component rows; the flat column remains
-- as a read-only cache and must reference an actual tax_group row.
DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_wht_tax_group_fk
        FOREIGN KEY (tenant_id, withholding_tax_group_id)
        REFERENCES control.tax_group (tenant_id, id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- End of 03b_constraints_ap_closure.sql
-- =============================================================================
-- Next steps:
--   1. npx tsx server/scripts/verify-ap-fk-orphans.ts  (CI gate)
--   2. If clean: psql -f 03c_constraints_ap_validate.sql
-- =============================================================================
