-- ============================================================================
-- document/01k_tables_procurement_intake.sql
-- Purpose: Additive columns for procurement line classification pipeline.
--          Safe to re-run (IF NOT EXISTS / idempotent guards throughout).
-- Depends on: 01e_tables_invoice.sql, 01j_tables_p2p.sql
-- ============================================================================

-- ── §PIL  purchase_invoice_line.classification_decision ──────────────────────
ALTER TABLE document.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS classification_decision jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN document.purchase_invoice_line.classification_decision IS
    'ARCHETYPE=D;SCOPE=T. IntentResolutionService pipeline output (ClassificationDecision v1). '
    'Keys: version, status, source, suggestions, selected, resolved, policy, '
    'explanations, overrides, blockers. Empty object on legacy rows. '
    'Written by the /lines/preview (mode=save) hook; read by the Classify tab.';

-- ── §PRL  purchase_requisition_line.classification_decision ──────────────────
ALTER TABLE document.purchase_requisition_line
    ADD COLUMN IF NOT EXISTS classification_decision jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN document.purchase_requisition_line.classification_decision IS
    'ARCHETYPE=D;SCOPE=T. Same shape as purchase_invoice_line.classification_decision. '
    'Written by the resolver on PR line save. Empty object on legacy rows.';

-- ── §IDX  Deferred partial indexes (Phase 3 — move here when ready) ──────────
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS pil_classdec_status_idx
--     ON document.purchase_invoice_line ((classification_decision->>'status'))
--     WHERE classification_decision <> '{}'::jsonb;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS prl_classdec_status_idx
--     ON document.purchase_requisition_line ((classification_decision->>'status'))
--     WHERE classification_decision <> '{}'::jsonb;

-- ── §TRGM  Trigram index on item_description (Phase 3) ───────────────────────
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS pil_item_desc_trgm_idx
--     ON document.purchase_invoice_line USING gin (item_description gin_trgm_ops);

DO $$ BEGIN
    RAISE NOTICE 'document/01k_tables_procurement_intake.sql applied: '
                 'classification_decision column added to purchase_invoice_line '
                 'and purchase_requisition_line.';
END $$;
