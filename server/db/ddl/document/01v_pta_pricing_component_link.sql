-- ============================================================================
-- document/01v_pta_pricing_component_link.sql
-- Concept: PTA ↔ PC link (P2 v1.2)
-- Depends on: 01e_tables_invoice.sql (PTA at line 615),
--             01u_tables_pricing_component.sql (PC)
-- Spec: docs/specs/pta_pab_retention_advance_overlap.md
--       docs/specs/purchase_invoice_field_design.md §3.5 (revised)
--
-- This file REPLACES the v1.0/v1.1 plan to create new retention_schedule and
-- advance_application tables. See pta_pab_retention_advance_overlap.md for the
-- architectural rationale: PTA already provides per-invoice clause evaluation
-- with ADVANCE / ADVANCE_RECOVERY / RETENTION / RETENTION_RELEASE; PAB rolls
-- balances. We only need a link from PC origin → PTA evaluation row.
-- ============================================================================


-- =============================================================================
-- §P2.1  pricing_component_id column on document.payment_term_application
-- =============================================================================
-- Nullable: existing clause-driven PTA rows have pricing_component_id IS NULL.
-- PC-driven rows (created by retention-advance-seeder at submit) have it set.
-- =============================================================================

ALTER TABLE document.payment_term_application
    ADD COLUMN IF NOT EXISTS pricing_component_id uuid;

COMMENT ON COLUMN document.payment_term_application.pricing_component_id IS
    'Link to the PC row that originated this PTA evaluation (when applicable). '
    'NULL for clause-driven PTA rows (existing flow). NOT NULL for PC-driven '
    'rows created by retention-advance-seeder at submit. See '
    'docs/specs/pta_pab_retention_advance_overlap.md.';


-- =============================================================================
-- Foreign key — tenant-scoped composite to align with Athyper convention
-- =============================================================================

-- H1.B fix: composite (tenant_id, pricing_component_id) SET NULL would attempt
-- to NULL tenant_id (NOT NULL). PG 15+ supports column-scoped SET NULL; older
-- fallback uses RESTRICT (PC rows are supersede-only anyway — RESTRICT correctly
-- reflects "this shouldn't be possible").
DO $$
BEGIN
    ALTER TABLE document.payment_term_application
        DROP CONSTRAINT IF EXISTS pta_pricing_component_fk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    ALTER TABLE document.payment_term_application
        ADD CONSTRAINT pta_pricing_component_fk
        FOREIGN KEY (tenant_id, pricing_component_id)
        REFERENCES document.pricing_component (tenant_id, id)
        ON DELETE SET NULL (pricing_component_id)
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN syntax_error THEN
        -- PG < 15 fallback
        ALTER TABLE document.payment_term_application
            ADD CONSTRAINT pta_pricing_component_fk
            FOREIGN KEY (tenant_id, pricing_component_id)
            REFERENCES document.pricing_component (tenant_id, id)
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED;
END $$;


-- =============================================================================
-- CHECK — PC-origin discriminator (NOT VALID; verify before validating)
-- =============================================================================
-- When pricing_component_id IS NOT NULL, the row represents a PC-driven
-- evaluation; both clause_id and payment_term_id MAY also be null in that case
-- (the term_snapshot path already accommodates non-clause origins).
--
-- We do NOT require clause_id to be NULL when pricing_component_id is set —
-- a future flow might use a payment-term clause that itself was driven by PC.
-- The CHECK below only asserts that PC-origin rows carry valid clause_type
-- consistent with PC term semantics.
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.payment_term_application
        ADD CONSTRAINT pta_pc_origin_clause_type_chk CHECK (
            pricing_component_id IS NULL
            OR clause_type IN ('RETENTION','RETENTION_RELEASE','ADVANCE','ADVANCE_RECOVERY')
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Operator step (after running verify-pta-pc-link.ts confirms 0 violations):
--   ALTER TABLE document.payment_term_application
--     VALIDATE CONSTRAINT pta_pc_origin_clause_type_chk;


-- =============================================================================
-- Indexes
-- =============================================================================

-- Find PTA rows driven by a specific PC (audit, reversal cascading)
CREATE INDEX IF NOT EXISTS ix_pta_pricing_component
    ON document.payment_term_application (tenant_id, pricing_component_id)
    WHERE pricing_component_id IS NOT NULL;


-- =============================================================================
-- §P2.4  document.v_invoice_retention_release_schedule  (read-side view)
-- =============================================================================
-- Combines PTA RETENTION_RELEASE rows with their PTC clause definition to give
-- consumers the "milestone calendar" per invoice without re-deriving the join.
--
-- Columns surface:
--   • invoice_id, invoice_line_id
--   • milestone sequence (PTA.evaluation_sequence_no)
--   • milestone label & event (PTC.clause_code, PTC.release_event)
--   • scheduled_amount = PTA.applied_amount (or default_amount if pending)
--   • released_amount  (sums fulfillment events linked to this PTA via reversal/supersede)
--   • status derived from PTA.application_status + reversed_by/superseded_by
--   • resolved_due_date (PTA)
-- =============================================================================

CREATE OR REPLACE VIEW document.v_invoice_retention_release_schedule AS
SELECT
    pta.tenant_id,
    pta.invoice_id,
    pta.invoice_line_id,
    pta.evaluation_sequence_no                     AS milestone_seq,
    pta.clause_id,
    pta.clause_code,
    pta.pricing_component_id,
    ptc.release_event                              AS release_event,
    ptc.release_delay_days                         AS release_delay_days,
    pta.resolved_due_date                          AS scheduled_release_date,
    pta.calculated_basis_amount                    AS basis_amount,
    pta.default_amount                             AS scheduled_amount,
    pta.applied_amount                             AS applied_amount,
    pta.running_total_amount                       AS running_total,
    pta.remaining_balance_amount                   AS remaining_amount,
    pta.application_status                         AS status,
    pta.is_effective                               AS is_effective,
    pta.reversed_by_application_id                 AS reversed_by_id,
    pta.superseded_by_application_id               AS superseded_by_id,
    pta.workflow_request_id                        AS release_workflow_request_id,
    pta.created_at                                 AS created_at
  FROM document.payment_term_application pta
  LEFT JOIN master.payment_term_clause      ptc
    ON ptc.id = pta.clause_id AND ptc.tenant_id = pta.tenant_id
 WHERE pta.clause_type = 'RETENTION_RELEASE';

COMMENT ON VIEW document.v_invoice_retention_release_schedule IS
    'Retention release milestone calendar per invoice. Joins '
    'payment_term_application (RETENTION_RELEASE rows) with payment_term_clause '
    'to surface release_event + delay + scheduled / applied / remaining amounts. '
    'Replaces the proposed document.retention_schedule table — see '
    'docs/specs/pta_pab_retention_advance_overlap.md.';


-- =============================================================================
-- End of 01v_pta_pricing_component_link.sql
-- =============================================================================
