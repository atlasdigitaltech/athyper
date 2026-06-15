-- ============================================================================
-- document/01z_row_version.sql
-- Concept: Optimistic row_version columns for aggregate-root document tables
-- Depends on: all 01*.sql document table files (runs last — 01z)
-- Scope: Phase 1 adds row_version to purchase_invoice only.
--        Other aggregate roots are commented out and added as UI wiring lands.
--        Each table added here MUST also get a trg_<table>_row_version trigger
--        in document/06_triggers.sql before going to rollout='enforced'.
-- ============================================================================

-- §PI  Purchase Invoice (Phase 1 — primary aggregate root in AP module)
ALTER TABLE document.purchase_invoice
    ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN document.purchase_invoice.row_version IS
    'Optimistic concurrency version. Incremented by trg_pi_row_version on every UPDATE '
    '(including header syncs triggered by trg_pil_sync_header on line changes). '
    'Callers that hold an edit-session lock must pass expected_row_version in the request body. '
    'A WHERE row_version = :expected rejects stale saves → 409 Conflict. '
    'See control.record_edit_lock for the edit-session lock that pairs with this column.';


-- §PIL  Purchase Invoice Line (P0 v1.2 — bulk line edit concurrency)
-- See docs/specs/purchase_invoice_field_design.md §3.2
ALTER TABLE document.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN document.purchase_invoice_line.row_version IS
    'Optimistic concurrency version. Incremented by trg_pil_row_version on every UPDATE. '
    'Pairs with bulk PATCH /api/finance/ap/invoices/:id/lines: each line carries an '
    'expected_row_version; mismatch → 409 RESOURCE_VERSION_CONFLICT. '
    'Without this, two concurrent grid-edit sessions silently last-write-wins.';


-- §AD  Accounting Distribution (P0 v1.2 — Stage 2 split-edit concurrency)
-- AD is mutable in Stages 1+2 (pre-post); frozen at Stage 4 (post-final-UPDATE) by
-- trg_ad_status_gated_mutation. row_version covers concurrent split edits in Stage 2
-- and the Stage 3 final-posting UPDATE.
ALTER TABLE document.accounting_distribution
    ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN document.accounting_distribution.row_version IS
    'Optimistic concurrency version. Incremented by trg_ad_row_version on every UPDATE. '
    'AD is mutable in Stages 1+2 (parent PI pre-post) and during the Stage 3 final '
    'posting UPDATE; row_version covers concurrent split edits and the final write. '
    'After Stage 4 (parent posted/paid/reversed), all UPDATEs blocked by trg_ad_status_gated_mutation.';


-- §PO  Purchase Order — Phase 2 (add trigger before enabling)
-- ALTER TABLE document.purchase_order
--     ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

-- §JE  Journal Entry — Phase 2
-- ALTER TABLE document.journal_entry
--     ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

-- §PE  Payment Entry — Phase 2
-- ALTER TABLE document.payment_entry
--     ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
