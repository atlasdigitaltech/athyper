-- ============================================================================
-- document/03f_constraints_pea_pta_restrict.sql
-- Concept: HF2-2 — Convert pea_pta_fk from column-scoped SET NULL to RESTRICT
-- Depends on: 03b_constraints_ap_closure.sql (FK creation),
--             06x_ap_append_only_triggers.sql (PEA immutability)
-- Spec: Hardening Sprint H-Fix-2 §HF2-2
--
-- pea_pta_fk currently uses column-scoped ON DELETE SET NULL on
-- payment_entry_allocation.payment_term_application_id. PEA rows are immutable
-- (trg_pea_immutable in H2), so a cascaded SET NULL update would be rejected
-- by the BEFORE UPDATE trigger.
--
-- This file uses NOT VALID so it is safe to auto-run by provision.ts even
-- when historical orphan data exists. The actual validation is part of the
-- operator script server/db/scripts/run-ap-fk-validate.sql (alongside the
-- other validations moved out of the auto-run DDL tree by HF2-4).
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation DROP CONSTRAINT IF EXISTS pea_pta_fk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.payment_entry_allocation
        ADD CONSTRAINT pea_pta_fk
        FOREIGN KEY (tenant_id, payment_term_application_id)
        REFERENCES document.payment_term_application (tenant_id, id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- End of 03f_constraints_pea_pta_restrict.sql
-- =============================================================================
-- VALIDATE pea_pta_fk is in server/db/scripts/run-ap-fk-validate.sql.
-- =============================================================================
