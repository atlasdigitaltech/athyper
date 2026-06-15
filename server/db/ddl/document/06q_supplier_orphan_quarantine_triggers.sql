-- ============================================================================
-- document/06q_supplier_orphan_quarantine_triggers.sql
-- Concept: HF2-1 — Append-only trigger for supplier orphan quarantine
-- Depends on: 01q_supplier_orphan_quarantine.sql (table),
--             log/05_functions.sql (log.trg_prevent_mutation function)
-- Spec: Hardening Sprint H-Fix-2 §HF2-1
--
-- The trigger was previously attached in 01q_supplier_orphan_quarantine.sql
-- but the function it references (log.trg_prevent_mutation) is created at
-- provisioner phase 80. 01*.sql files run at phase 40. This file (06q) runs
-- at phase 90 so the function dependency is satisfied.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_srq_immutable ON document.supplier_rebuild_orphan_quarantine;
CREATE TRIGGER trg_srq_immutable
    BEFORE UPDATE OR DELETE ON document.supplier_rebuild_orphan_quarantine
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

COMMENT ON TRIGGER trg_srq_immutable ON document.supplier_rebuild_orphan_quarantine IS
    'Append-only: the quarantine is an audit log of orphans seen at supplier rebuild. '
    'Rows are inserted only; UPDATE and DELETE are blocked via log.trg_prevent_mutation().';


-- =============================================================================
-- End of 06q_supplier_orphan_quarantine_triggers.sql
-- =============================================================================
