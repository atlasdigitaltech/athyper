-- =============================================================================
-- LookupDomain/document/004d_purchase_invoice_streamlining.sql
-- Invoice-type vocabulary streamlining — 9 types → 7 types (5 primary + 2 advanced)
--
-- §S1  Backfill existing rows: invoice_type renames
--        down_payment → advance
--        proforma     → standard  (proforma is now a status, not a type)
-- §S2  Retire deprecated codes from the lookup domain
-- §S3  Rebuild the purchase_invoice.invoice_type CHECK constraint
-- §S4  Re-seed lookup_value metadata with display_tier (primary / advanced)
--
-- Run as a single transaction — all steps are atomic.
-- Idempotent: each step is safe to re-run.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §S1  Backfill document.purchase_invoice
-- ─────────────────────────────────────────────────────────────────────────────

-- down_payment → advance (consolidated into the unified Advance type)
UPDATE document.purchase_invoice
   SET invoice_type = 'advance'
 WHERE invoice_type = 'down_payment';

-- proforma is now a lifecycle status, not an invoice_type.
-- Rows created with invoice_type='proforma' were effectively standard AP invoices
-- that were awaiting confirmation, so they fall back to 'standard'.
UPDATE document.purchase_invoice
   SET invoice_type = 'standard'
 WHERE invoice_type = 'proforma';

-- ─────────────────────────────────────────────────────────────────────────────
-- §S2  Retire deprecated lookup values
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE control.lookup_value
   SET status = 'deprecated',
       description = COALESCE(description, '') ||
         ' [Retired: merged into advance]'
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code = 'down_payment'
   AND tenant_id IS NULL
   AND status = 'active';

UPDATE control.lookup_value
   SET status = 'deprecated',
       description = COALESCE(description, '') ||
         ' [Retired: proforma is now a purchase_invoice status, not a type]'
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code = 'proforma'
   AND tenant_id IS NULL
   AND status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- §S3  Rebuild the invoice_type CHECK constraint
--      New allowed set: 7 values (5 primary + 2 advanced)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_constraint_name text;
BEGIN
    -- Find and drop the existing invoice_type check constraint (any name)
    SELECT constraint_name
      INTO v_constraint_name
      FROM information_schema.table_constraints
     WHERE table_schema = 'document'
       AND table_name   = 'purchase_invoice'
       AND constraint_type = 'CHECK'
       AND constraint_name LIKE '%invoice_type%'
     LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE document.purchase_invoice DROP CONSTRAINT %I',
            v_constraint_name
        );
    END IF;
END $$;

ALTER TABLE document.purchase_invoice
    ADD CONSTRAINT pi_invoice_type_chk CHECK (
        invoice_type IN (
            'standard',
            'credit_note',
            'debit_note',
            'advance',
            'retention_release',
            'self_billed',
            'final'
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- §S4  Seed display_tier metadata on lookup_value rows
--      Five primary types are always visible in the chip strip.
--      Two advanced types are revealed via "More types…" affordance.
--      Requires control.lookup_value.metadata JSONB column.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure the metadata column exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'control'
           AND table_name   = 'lookup_value'
           AND column_name  = 'metadata'
    ) THEN
        ALTER TABLE control.lookup_value ADD COLUMN metadata jsonb;
    END IF;
END $$;

-- Primary tier — 5 types always visible
--   Standard / Credit Note / Debit Note / Advance / Retention Release
UPDATE control.lookup_value
   SET metadata = COALESCE(metadata, '{}') || '{"display_tier":"primary"}'::jsonb
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code IN ('standard', 'credit_note', 'debit_note', 'advance', 'retention_release')
   AND tenant_id IS NULL;

-- Advanced tier — 2 types behind "More types…"
--   Final / Self-Billed
UPDATE control.lookup_value
   SET metadata = COALESCE(metadata, '{}') || '{"display_tier":"advanced"}'::jsonb
 WHERE domain_code = 'document.purchase_invoice_type'
   AND code IN ('final', 'self_billed')
   AND tenant_id IS NULL;

-- Re-order active values to match the canonical display order
UPDATE control.lookup_value SET sort_order = 10 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'standard'          AND tenant_id IS NULL;
UPDATE control.lookup_value SET sort_order = 20 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'credit_note'       AND tenant_id IS NULL;
UPDATE control.lookup_value SET sort_order = 30 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'debit_note'        AND tenant_id IS NULL;
UPDATE control.lookup_value SET sort_order = 40 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'advance'           AND tenant_id IS NULL;
UPDATE control.lookup_value SET sort_order = 50 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'retention_release' AND tenant_id IS NULL;
UPDATE control.lookup_value SET sort_order = 60 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'final'             AND tenant_id IS NULL;
UPDATE control.lookup_value SET sort_order = 70 WHERE domain_code = 'document.purchase_invoice_type' AND code = 'self_billed'       AND tenant_id IS NULL;

COMMIT;
