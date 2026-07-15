-- ============================================================================
-- document/01z_row_version.sql
-- Concept: Optimistic row_version columns for aggregate-root document tables
-- Depends on: all 01*.sql document table files (runs last — 01z)
--
-- Coverage status (P2P plan §Plan 2):
--   purchase_invoice            ✅ column here + trigger in 06_triggers.sql
--   purchase_invoice_line       ✅ column here + trigger
--   purchase_requisition (+line)        — column added by 01j universal-cols + trigger pending Plan 2 batch
--   commitment (+ line)                 — column in 01c + trigger pending Plan 2 batch
--   purchase_order_confirmation (+line) — column in 01j + trigger pending Plan 2 batch
--   delivery_note (+ line)              — column in 01j + trigger pending Plan 2 batch
--   receipt (+ line)                    — column in 01j + trigger in 06_triggers.sql (POC)
--   service_sheet (+ line)              — column in 01j + trigger in 06_triggers.sql (POC)
--
-- Out of scope today (no row_version column on the table):
--   commitment_procurement       — 1:1 child of commitment; commitment trigger covers the aggregate
--   payment_entry                — column add deferred; payment lifecycle has its own immutability guard
--   journal_entry                — column add deferred; JE posting is single-shot, not concurrently edited
--
-- Every table with a row_version column MUST also have a
-- trg_<table>_row_version trigger in document/06_triggers.sql before going
-- to rollout='enforced'. The verifier server/scripts/verify-row-version-
-- coverage.ts (Plan 2) enforces this invariant.
-- ============================================================================

-- §PI  Purchase Invoice (Phase 1 — primary aggregate root in AP module)
ALTER TABLE document.purchase_invoice
    ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN document.purchase_invoice.row_version IS
    'Optimistic concurrency version. Incremented by trg_pi_row_version on every UPDATE '
    '(including header syncs triggered by trg_pil_sync_header on line changes). '
    'Callers that hold a document edit lock must pass expected_row_version in the request body. '
    'A WHERE row_version = :expected rejects stale saves → 409 Conflict. '
    'See control.record_edit_lock for the document edit lock that pairs with this column.';


-- §PIL  Purchase Invoice Line (P0 v1.2 — bulk line edit concurrency)
-- See docs/specs/purchase_invoice_field_design.md §3.2
ALTER TABLE document.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN document.purchase_invoice_line.row_version IS
    'Optimistic concurrency version. Incremented by trg_pil_row_version on every UPDATE. '
    'Pairs with bulk PATCH /api/finance/ap/invoices/:id/lines: each line carries an '
    'expected_row_version; mismatch → 409 RESOURCE_VERSION_CONFLICT. '
    'Without this, two concurrent grid-edit sessions silently last-write-wins.';


-- §PO  Purchase Order is a view over document.commitment + commitment_procurement
--      (see document/07_views.sql). The view projects c.row_version from the
--      commitment base table (bumped by trg_cmt_row_version). No ALTER TABLE
--      here — the column lives on commitment, do not duplicate it on the view.

-- §JE / §PE  Journal Entry and Payment Entry do not carry row_version today.
--      Both have strong post/posting immutability guards and are not concurrently
--      edited in practice. Add the column + trigger here when the use case
--      (e.g. concurrent draft editing of journal_line bulk grids) lands.
