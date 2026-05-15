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


-- §PO  Purchase Order — Phase 2 (add trigger before enabling)
-- ALTER TABLE document.purchase_order
--     ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

-- §JE  Journal Entry — Phase 2
-- ALTER TABLE document.journal_entry
--     ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

-- §PE  Payment Entry — Phase 2
-- ALTER TABLE document.payment_entry
--     ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
