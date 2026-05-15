-- ============================================================================
-- document/01q_tables_payment_recon_fk.sql
-- Phase 5: Add bank_statement_line_id shortcut FK to payment_entry.
--
-- This is a CONVENIENCE column only — it allows fast lookup of which
-- bank statement line was matched to a payment without joining through
-- bank_recon_case_line. The canonical M:N matching record lives in
-- document.bank_recon_case_line.
--
-- payment_entry.status stays 'posted' after reconciliation (never changes
-- to 'cleared'). Reconciliation state is conveyed by:
--   1. payment_entry.cleared_date           — date the bank cleared the payment
--   2. payment_entry.bank_statement_line_id — shortcut to matched statement line
--   3. document.bank_recon_case_line rows   — canonical M:N match record
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- FK constraint added in document/03_constraints.sql.
-- ============================================================================

ALTER TABLE document.payment_entry
    ADD COLUMN IF NOT EXISTS bank_statement_line_id uuid;

COMMENT ON COLUMN document.payment_entry.bank_statement_line_id IS
    'Shortcut FK to the bank_statement_line this payment was matched against. '
    'NULL until reconciled. Set alongside cleared_date during reconciliation. '
    'Canonical M:N matching record is in bank_recon_case_line. '
    'payment_entry.status stays ''posted'' — this column (not status) signals reconciliation.';
