-- ============================================================================
-- document/01q_supplier_orphan_quarantine.sql
-- Concept: H2.B — Quarantine table for supplier rebuild guard orphans
-- Depends on: master.supplier (target of integrity check)
-- Spec: AP Schema Hardening Plan §H2.B
--
-- Purpose: provide a stable, queryable record of orphan supplier_id rows
-- detected during the master.supplier rebuild path. The original guard in
-- 03_constraints.sql blindly NULLed orphans even on NOT NULL columns
-- (party_advance_balance, payment_remittance_output), which would crash.
--
-- Pattern:
--   • Detect orphans → INSERT into this quarantine table
--   • For tables with metadata column: tag and NULL (where supplier_id is nullable)
--   • For NOT NULL columns: do NOT mutate; raise unless app.rebuild_force=true
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.supplier_rebuild_orphan_quarantine (
    id                  uuid          NOT NULL DEFAULT shared.uuidv7(),
    detected_at         timestamptz   NOT NULL DEFAULT now(),
    source_schema       text          NOT NULL DEFAULT 'document',
    source_table        text          NOT NULL,
    source_id           uuid          NOT NULL,
    tenant_id           uuid,
    stale_supplier_id   uuid          NOT NULL,
    action_taken        text          NOT NULL,
    notes               text,
    CONSTRAINT srq_pkey            PRIMARY KEY (id),
    CONSTRAINT srq_action_chk      CHECK (action_taken IN (
        'nulled_and_tagged',  -- table has metadata and nullable supplier_id
        'detected_blocking',  -- NOT NULL column; orphan blocks rebuild
        'force_skipped'       -- app.rebuild_force=true was set
    ))
);

-- Index for fast triage by source_table
CREATE INDEX IF NOT EXISTS srq_source_idx
    ON document.supplier_rebuild_orphan_quarantine (source_table, detected_at DESC);

COMMENT ON TABLE document.supplier_rebuild_orphan_quarantine IS
    'Append-only audit of orphan supplier_id rows detected at master.supplier rebuild. '
    'Operators consult this table when the rebuild guard reports SUPPLIER_REBUILD_BLOCKED. '
    'Triage path: delete orphan row OR resurrect the missing supplier OR set '
    'app.rebuild_force=true to override.';

-- HF2-1 (clean-deploy fix): the trigger that attaches log.trg_prevent_mutation()
-- to this table was moved to 06q_supplier_orphan_quarantine_triggers.sql.
-- Rationale: log.trg_prevent_mutation() is defined in log/05_functions.sql,
-- which runs at provisioner phase 80. 01*.sql files run at phase 40 — so a
-- clean deploy that includes the CREATE TRIGGER here would fail with
-- "function log.trg_prevent_mutation() does not exist". The trigger attachment
-- now lives in a 06*.sql file (phase 90), where the function is guaranteed
-- to exist.


-- =============================================================================
-- End of 01q_supplier_orphan_quarantine.sql
-- =============================================================================
