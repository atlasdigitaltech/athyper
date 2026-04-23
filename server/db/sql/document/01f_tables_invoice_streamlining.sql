-- =============================================================================
-- File    : document/01f_tables_invoice_streamlining.sql
-- Purpose : Phase 1 DDL — streamline document.purchase_invoice schema
--           Corrects the type/status vocabulary, relaxes hard NOT NULL
--           constraints to status-aware CHECK constraints, and adds tax_mode
--           columns with associated CHECK constraints.
--
-- Modifies: document.purchase_invoice
--
-- Idempotent: YES — all operations use IF EXISTS / IF NOT EXISTS guards or
--             drop-then-add patterns; safe to run multiple times.
--
-- Apply order: Phase 1 DDL — 01f prefix guarantees execution after
--              01e_tables_invoice.sql (which creates document.purchase_invoice).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- §S1  Data migration — must run BEFORE constraint changes
--      Migrate stale type values out of the columns before the vocabulary
--      CHECK constraints are tightened in §S4.
-- ---------------------------------------------------------------------------

-- Normalize to canonical lowercase first (guards against any rows written with
-- uppercase values; must run before vocabulary renames and §S4 ADD CONSTRAINT).
UPDATE document.purchase_invoice
   SET invoice_type = LOWER(invoice_type)
 WHERE invoice_type <> LOWER(invoice_type);

-- Migrate down_payment → advance
UPDATE document.purchase_invoice
   SET invoice_type = 'advance'
 WHERE invoice_type = 'down_payment';

-- Migrate proforma invoice_type → standard
UPDATE document.purchase_invoice
   SET invoice_type = 'standard'
 WHERE invoice_type = 'proforma';

-- ---------------------------------------------------------------------------
-- §S2  Nullability changes
-- ---------------------------------------------------------------------------

ALTER TABLE document.purchase_invoice
  ALTER COLUMN supplier_invoice_number DROP NOT NULL;

ALTER TABLE document.purchase_invoice
  ALTER COLUMN supplier_invoice_date DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- §S3  New columns
-- ---------------------------------------------------------------------------

ALTER TABLE document.purchase_invoice
  ADD COLUMN IF NOT EXISTS tax_mode text;

ALTER TABLE document.purchase_invoice
  ADD COLUMN IF NOT EXISTS tax_mode_source text;

-- ---------------------------------------------------------------------------
-- §S3a Backfill tax_mode for rows that pre-date this migration.
-- ---------------------------------------------------------------------------

UPDATE document.purchase_invoice
   SET tax_mode        = 'exclusive',
       tax_mode_source = 'cannot_infer'
 WHERE tax_mode IS NULL
   AND status <> 'proforma';

-- ---------------------------------------------------------------------------
-- §S4  Drop and recreate vocabulary CHECK constraints
-- ---------------------------------------------------------------------------

-- pi_type_chk — 7-value vocabulary (proforma and down_payment removed)
ALTER TABLE document.purchase_invoice DROP CONSTRAINT IF EXISTS pi_type_chk;
ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_type_chk CHECK (
    invoice_type IN ('standard','credit_note','debit_note','advance',
                     'retention_release','self_billed','final'));

-- pi_status_chk — adds proforma at front of the status vocabulary
ALTER TABLE document.purchase_invoice DROP CONSTRAINT IF EXISTS pi_status_chk;
ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_status_chk CHECK (
    status IN ('proforma','draft','pending_approval','approved','posted',
               'partially_paid','fully_paid','on_hold','reversed','cancelled','rejected'));

-- pi_commitment_req — status-aware: proforma invoices defer the requirement
ALTER TABLE document.purchase_invoice DROP CONSTRAINT IF EXISTS pi_commitment_req;
ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_commitment_req CHECK (
    status = 'proforma'
    OR invoice_source NOT IN ('po_based','contract_based')
    OR commitment_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- §S5  New status-aware and tax-mode CHECK constraints
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'pi_supplier_invoice_number_req'
                    AND conrelid = 'document.purchase_invoice'::regclass) THEN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_supplier_invoice_number_req CHECK (
        status = 'proforma'
        OR (supplier_invoice_number IS NOT NULL AND btrim(supplier_invoice_number) <> ''));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'pi_supplier_invoice_date_req'
                    AND conrelid = 'document.purchase_invoice'::regclass) THEN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_supplier_invoice_date_req CHECK (
        status = 'proforma'
        OR supplier_invoice_date IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'pi_tax_mode_chk'
                    AND conrelid = 'document.purchase_invoice'::regclass) THEN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_tax_mode_chk CHECK (
        tax_mode IS NULL OR tax_mode IN ('inclusive','exclusive','no_tax'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'pi_tax_mode_req'
                    AND conrelid = 'document.purchase_invoice'::regclass) THEN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_tax_mode_req CHECK (
        status = 'proforma'
        OR tax_mode IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'pi_tax_mode_source_chk'
                    AND conrelid = 'document.purchase_invoice'::regclass) THEN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_tax_mode_source_chk CHECK (
        tax_mode_source IS NULL
        OR tax_mode_source IN ('supplier_profile','tax_group','company_default',
                               'user_override','cannot_infer'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'pi_tax_mode_no_tax_chk'
                    AND conrelid = 'document.purchase_invoice'::regclass) THEN
    ALTER TABLE document.purchase_invoice ADD CONSTRAINT pi_tax_mode_no_tax_chk CHECK (
        tax_mode IS DISTINCT FROM 'no_tax'
        OR tax_amount = 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- §S6  Rebuild dedup index to exclude proforma
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS document.pi_supplier_invoice_dedup_idx;

CREATE INDEX IF NOT EXISTS pi_supplier_invoice_dedup_idx
    ON document.purchase_invoice (tenant_id, supplier_id, supplier_invoice_number, supplier_invoice_date)
    WHERE supplier_id IS NOT NULL
      AND status NOT IN ('cancelled','rejected','proforma');

DO $$ BEGIN
  RAISE NOTICE 'purchase_invoice streamlining applied: 7-type vocabulary, proforma status, tax_mode columns, status-aware constraints, dedup index rebuilt';
END $$;
