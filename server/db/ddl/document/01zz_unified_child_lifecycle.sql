-- ============================================================================
-- document/01zz_unified_child_lifecycle.sql
-- Concept: Unified parent-governed child carrier contract for AD / PC / SL.
--
-- Parent document lifecycle controls child editability. Child tables expose a
-- common audit envelope and current-row read contract. PC replacement history
-- is handled by log.audit_log + lifecycle snapshots, not business-facing child
-- lifecycle state.
-- ============================================================================

ALTER TABLE IF EXISTS document.accounting_distribution
    ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS document.schedule_line
    ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN document.accounting_distribution.tags IS
    'Operational tags. Part of the common child-carrier audit envelope.';

COMMENT ON COLUMN document.schedule_line.tags IS
    'Operational tags. Part of the common child-carrier audit envelope.';

COMMENT ON COLUMN document.pricing_component.superseded_by_id IS
    'Compatibility-only legacy replacement-chain pointer. Do not expose as a business lifecycle field; PC history is recorded through log.audit_log and lifecycle snapshots.';

COMMENT ON COLUMN document.pricing_component.superseded_at IS
    'Compatibility-only legacy replacement timestamp. Do not expose as a business lifecycle field.';

COMMENT ON COLUMN document.pricing_component.superseded_by_user IS
    'Compatibility-only legacy replacement actor. Do not expose as a business lifecycle field.';

COMMENT ON COLUMN document.schedule_line.status IS
    'Compatibility/internal schedule state. Parent document lifecycle controls editability; do not expose as an independent child lifecycle.';

COMMENT ON COLUMN document.schedule_line.status_source IS
    'Compatibility/internal schedule state provenance. Parent document lifecycle controls editability.';

COMMENT ON COLUMN document.schedule_line.terminal_status IS
    'Compatibility/internal schedule retirement marker. Parent document lifecycle controls editability; current reads should use v_current_schedule_line.';

CREATE OR REPLACE VIEW document.v_current_accounting_distribution AS
SELECT *
FROM document.accounting_distribution;

CREATE OR REPLACE VIEW document.v_current_pricing_component AS
SELECT *
FROM document.pricing_component
WHERE superseded_by_id IS NULL;

CREATE OR REPLACE VIEW document.v_current_schedule_line AS
SELECT *
FROM document.schedule_line
WHERE is_current_version = true
  AND terminal_status IS NULL;

COMMENT ON VIEW document.v_current_accounting_distribution IS
    'Current accounting distribution rows. Parent document lifecycle controls editability/freeze.';

COMMENT ON VIEW document.v_current_pricing_component IS
    'Current pricing component rows. Compatibility filter hides legacy replacement-chain rows; new writes should use parent-gated replace/save and generic audit.';

COMMENT ON VIEW document.v_current_schedule_line IS
    'Current schedule lines. Hides prior schedule revisions and terminal schedule rows from normal consumers.';

-- ============================================================================
-- End of 01zz_unified_child_lifecycle.sql
-- ============================================================================
