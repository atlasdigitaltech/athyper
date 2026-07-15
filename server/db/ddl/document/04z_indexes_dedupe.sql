-- ============================================================================
-- document/04z_indexes_dedupe.sql
-- Concept: H3 — Resolve duplicate index name conflicts in 04_indexes.sql
-- Depends on: 04_indexes.sql
-- Spec: AP Schema Hardening Plan §H3
--
-- 5 indexes are declared twice in 04_indexes.sql (lines ~220 and ~568). Because
-- of `IF NOT EXISTS`, the SECOND, presumably-improved definitions never deploy.
--
-- Live audit on athyper_neon confirms the FIRST definitions are deployed.
-- This file DROPs the live (first) version and CREATEs the intended (second)
-- version where the second is strictly better:
--
--   pi_due_date_idx      — second adds company_code_id + approved status
--   pil_invoice_idx      — second adds line_no for ordered traversal
--
-- For the 3 indexes where both definitions are identical, no action needed:
--   pi_workflow_idx, pil_commitment_line_idx, pil_gr_line_idx
--
-- ALSO: Update 04_indexes.sql to remove the stale first definitions so future
-- deploys are clean. That cleanup is in the same patch.
-- ============================================================================


-- §1  pi_due_date_idx — second definition wins (company_code_id + approved status)
DROP INDEX IF EXISTS document.pi_due_date_idx;
CREATE INDEX IF NOT EXISTS pi_due_date_idx
    ON document.purchase_invoice (tenant_id, company_code_id, due_date ASC)
    WHERE status IN ('approved','posted','partially_paid');


-- §2  pil_invoice_idx — second definition wins (adds line_no ASC for ordered traversal)
DROP INDEX IF EXISTS document.pil_invoice_idx;
CREATE INDEX IF NOT EXISTS pil_invoice_idx
    ON document.purchase_invoice_line (tenant_id, purchase_invoice_id, line_no ASC);


-- §3-5  pi_workflow_idx, pil_commitment_line_idx, pil_receipt_line_idx
-- Live audit confirmed both definitions are identical — no DROP needed.
-- Documenting here for reviewer clarity:
--   pi_workflow_idx          (tenant) (workflow_request_id) WHERE NOT NULL — identical
--   pil_commitment_line_idx  (tenant, commitment_line_id) WHERE NOT NULL  — identical
--   pil_receipt_line_idx     (tenant, receipt_line_id) WHERE NOT NULL — identical


-- =============================================================================
-- End of 04z_indexes_dedupe.sql
-- =============================================================================
-- Next cleanup (separate PR): edit 04_indexes.sql to remove the stale FIRST
-- definitions of pi_due_date_idx and pil_invoice_idx so deploys stay clean.
-- =============================================================================
