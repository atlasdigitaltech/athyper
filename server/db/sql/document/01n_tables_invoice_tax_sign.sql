-- ============================================================================
-- document/01n_tables_invoice_tax_sign.sql
-- Phase 3: relax non-negative constraints on invoice line tax columns.
--
-- Rationale:
--   Credit notes (is_credit_note = true) have negative net_amount on lines
--   (unit_price >= 0, quantity < 0).  tax_amount and withholding_tax_amount
--   must follow the same sign so that fn_refresh_purchase_invoice_totals
--   can sum all line amounts uniformly into the invoice header, and so that
--   the posting JE calculation Math.abs(net_amount + tax_amount) is correct.
--
--   pil_tax_nonneg / pil_wht_nonneg blocked this.  They are dropped here;
--   no replacement constraint is added — the sign is an invariant of the
--   application layer (tax_sign = sign(net_amount)), not a DB scalar range.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS is safe on repeated runs.
-- ============================================================================

ALTER TABLE document.purchase_invoice_line
    DROP CONSTRAINT IF EXISTS pil_tax_nonneg;

ALTER TABLE document.purchase_invoice_line
    DROP CONSTRAINT IF EXISTS pil_wht_nonneg;
