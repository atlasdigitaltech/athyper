-- =============================================================================
-- File    : document/01s_tables_source_binding.sql
-- Purpose : Adds `source_binding jsonb` column to lines that can be created
--           via the @athyper/runtime-add-item framework. Captures the
--           framework-level provenance metadata (sourceType + sourceRef
--           with audit details such as `remainingQtyAtSelection`,
--           `currencyMismatch`, `unitPriceAtSelection`, etc.) that
--           complements but does not duplicate the structural FK columns
--           (commitment_line_id, receipt_line_id, service_sheet_line_id).
--
--           Shape matches `SourceBindingSchema` in
--           packages/shared/runtime-domain/runtime-contracts/src/source-adapter.ts:
--             {
--               sourceType:   <registered adapter id>,
--               sourceDocType: text?,
--               sourceDocId:   text?,
--               sourceLineId:  text?,
--               sourceRef:     jsonb (free-form, adapter-specific),
--               matchType:     "three_way" | "two_way" | "no_match" | "evaluated_receipt" | null
--             }
--
-- Modifies: document.purchase_invoice_line
--
-- Idempotent: YES â€” uses ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--
-- Apply order: Phase 7 follow-up DDL â€” 01s prefix guarantees execution after
--              01e (purchase_invoice / purchase_invoice_line creation) and
--              after 01f (invoice streamlining). Safe to run multiple times.
--
-- Forward compatibility note:
--   Other line tables that can be filled via source adapters in the future
--   (purchase_requisition_line, commitment_line, sales_order_line, etc.)
--   should follow this same column shape. Add a parallel ALTER block in a
--   later migration as adapters for those entities ship; the framework
--   contract guarantees the column shape is stable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Â§1 Column
-- ---------------------------------------------------------------------------

ALTER TABLE document.purchase_invoice_line
  ADD COLUMN IF NOT EXISTS source_binding jsonb;

COMMENT ON COLUMN document.purchase_invoice_line.source_binding IS
    'Source-adapter provenance metadata. Shape: { sourceType, sourceDocType?, sourceDocId?, sourceLineId?, sourceRef?, matchType? }. '
    'Populated by the @athyper/runtime-add-item framework at line-insert time. '
    'NULL for lines created outside the framework (e.g., historical imports, legacy create flows). '
    'See packages/shared/runtime-domain/runtime-contracts/src/source-adapter.ts SourceBindingSchema for the full Zod schema.';

-- ---------------------------------------------------------------------------
-- Â§2 Shape guard
--   The framework guarantees `sourceType` is always present when the column
--   is non-NULL. The check is a string-only minimum; full Zod validation
--   happens at the application layer.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pil_source_binding_shape_chk'
          AND conrelid = 'document.purchase_invoice_line'::regclass
    ) THEN
        ALTER TABLE document.purchase_invoice_line
          ADD CONSTRAINT pil_source_binding_shape_chk
          CHECK (
              source_binding IS NULL
              OR (
                  jsonb_typeof(source_binding) = 'object'
                  AND source_binding ? 'sourceType'
                  AND jsonb_typeof(source_binding -> 'sourceType') = 'string'
              )
          );
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Â§3 Forensics index
--   GIN index supports forensic queries like:
--     SELECT * FROM document.purchase_invoice_line
--      WHERE source_binding @> '{"sourceType":"open_po_line","sourceDocId":"<po-uuid>"}'
--   Without this index, the audit team's "show me every invoice line drawn
--   from PO X" query would full-scan. Predicate-partial: only indexes rows
--   that actually carry a binding (which is the live state going forward;
--   historical NULL rows don't bloat the index).
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS pil_source_binding_gin
    ON document.purchase_invoice_line
    USING GIN (source_binding)
    WHERE source_binding IS NOT NULL;
