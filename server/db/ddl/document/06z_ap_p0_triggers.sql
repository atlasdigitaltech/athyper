-- ============================================================================
-- document/06z_ap_p0_triggers.sql
-- Concept: AP P0 Triggers (v1.2) — row_version on PIL/AD, dimension_set hash,
--          AD polymorphic validation, AD status-gated mutation, audit sidecar
--          immutability
-- Depends on: 06_triggers.sql (shared.trg_increment_row_version),
--             01t_ap_p0_foundations.sql (validation + hash functions)
-- Spec: docs/specs/purchase_invoice_field_design.md §8
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================


-- =============================================================================
-- §P0.1  row_version triggers on PIL and AD
-- =============================================================================
-- Pattern matches §ROW_VERSION block in 06_triggers.sql.
-- The shared.trg_increment_row_version() function lives there.
-- =============================================================================

-- §PIL  Purchase Invoice Line row_version
DROP TRIGGER IF EXISTS trg_pil_row_version ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_row_version
    BEFORE UPDATE ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER trg_pil_row_version ON document.purchase_invoice_line IS
    'Increments row_version on every UPDATE to purchase_invoice_line. '
    'Pairs with bulk PATCH /api/finance/ap/invoices/:id/lines — each line carries '
    'expected_row_version; mismatch → 409 RESOURCE_VERSION_CONFLICT.';


-- §AD  Accounting Distribution row_version
DROP TRIGGER IF EXISTS trg_ad_row_version ON document.accounting_distribution;
CREATE TRIGGER trg_ad_row_version
    BEFORE UPDATE ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER trg_ad_row_version ON document.accounting_distribution IS
    'Increments row_version on every UPDATE to accounting_distribution, including '
    'the Stage 3 final-posting UPDATE. Pairs with split-edit If-Match in Stage 2.';


-- =============================================================================
-- §P0.5  AD polymorphic source validation
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ad_validate_polymorphic_source ON document.accounting_distribution;
CREATE TRIGGER trg_ad_validate_polymorphic_source
    BEFORE INSERT OR UPDATE OF source_doc_type, source_doc_id, source_line_id
    ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION document.fn_ad_validate_polymorphic_source();

COMMENT ON TRIGGER trg_ad_validate_polymorphic_source ON document.accounting_distribution IS
    'Validates polymorphic source tuple: parent row exists in the correct table per '
    'source_doc_type, tenant matches, source_doc_id (header) owns source_line_id. '
    'Hard-validates PURCHASE_INVOICE_LINE; other source types soft-validated pending '
    'per-domain wiring.';


-- =============================================================================
-- §P0.6  AD status-gated mutation (Decision #17 — Option A)
-- =============================================================================
-- Reads OLD parent status. Allows Stage 3 final-posting UPDATE (OLD parent is
-- still 'approved' at that moment) while blocking any further write once parent
-- enters posted family.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ad_status_gated_mutation ON document.accounting_distribution;
CREATE TRIGGER trg_ad_status_gated_mutation
    BEFORE UPDATE OR DELETE ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION document.fn_ad_status_gated_mutation();

COMMENT ON TRIGGER trg_ad_status_gated_mutation ON document.accounting_distribution IS
    'Blocks UPDATE/DELETE when OLD parent PI status is terminal '
    '(posted/partially_paid/fully_paid/reversed/cancelled). '
    'Allows the Stage 3 final-posting UPDATE because OLD parent is still ''approved'' '
    'at that moment. Posting service ordering is critical: AD UPDATEs BEFORE pi.status=posted.';


-- =============================================================================
-- §P0.7  Dimension Set Hash triggers (PI, PIL, AD)
-- =============================================================================
-- PC is skipped — PC has no dimension columns in v1.2.
-- =============================================================================

-- §PI
DROP TRIGGER IF EXISTS trg_pi_dimension_set_hash ON document.purchase_invoice;
CREATE TRIGGER trg_pi_dimension_set_hash
    BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id, site_id
    ON document.purchase_invoice
    FOR EACH ROW EXECUTE FUNCTION shared.trg_dimension_set_hash_refresh();

COMMENT ON TRIGGER trg_pi_dimension_set_hash ON document.purchase_invoice IS
    'Keeps dimension_set_id in sync with the four scalar dimensions. '
    'Decision #2 (v1.2): scalars canonical; dim_set derived.';

-- §PIL
DROP TRIGGER IF EXISTS trg_pil_dimension_set_hash ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_dimension_set_hash
    BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id, site_id
    ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION shared.trg_dimension_set_hash_refresh();

COMMENT ON TRIGGER trg_pil_dimension_set_hash ON document.purchase_invoice_line IS
    'Keeps dimension_set_id in sync with the four scalar dimensions on PIL.';

-- §AD
DROP TRIGGER IF EXISTS trg_ad_dimension_set_hash ON document.accounting_distribution;
CREATE TRIGGER trg_ad_dimension_set_hash
    BEFORE INSERT OR UPDATE OF cost_center_id, profit_center_id, project_id, site_id
    ON document.accounting_distribution
    FOR EACH ROW EXECUTE FUNCTION shared.trg_dimension_set_hash_refresh();

COMMENT ON TRIGGER trg_ad_dimension_set_hash ON document.accounting_distribution IS
    'Keeps dimension_set_id in sync with the four scalar dimensions on AD. '
    'Includes the Stage 3 final-posting UPDATE: re-frozen dimensions ⇒ re-frozen hash.';


-- =============================================================================
-- §P0.4  Audit sidecar immutability (log.trg_prevent_mutation)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ad_resolution_audit_immutable
    ON document.accounting_distribution_resolution_audit;
CREATE TRIGGER trg_ad_resolution_audit_immutable
    BEFORE UPDATE OR DELETE ON document.accounting_distribution_resolution_audit
    FOR EACH ROW EXECUTE FUNCTION log.trg_prevent_mutation();

COMMENT ON TRIGGER trg_ad_resolution_audit_immutable ON document.accounting_distribution_resolution_audit IS
    'Append-only: blocks UPDATE/DELETE via log.trg_prevent_mutation(). '
    'Audit rows are INSERTed once during Stage 3 final posting UPDATE and never modified.';


-- =============================================================================
-- End of 06z_ap_p0_triggers.sql
-- =============================================================================
