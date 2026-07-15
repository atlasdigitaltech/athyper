-- ============================================================================
-- document/06u_pricing_component_triggers.sql
-- Concept: PC triggers — row_version, polymorphic source validation, supersede gate
-- Depends on: 01u_tables_pricing_component.sql (table + functions),
--             06_triggers.sql (shared.trg_increment_row_version)
-- Spec: docs/specs/purchase_invoice_field_design.md §8
-- ============================================================================


-- §PC  row_version increment
DROP TRIGGER IF EXISTS trg_pc_row_version ON document.pricing_component;
CREATE TRIGGER trg_pc_row_version
    BEFORE UPDATE ON document.pricing_component
    FOR EACH ROW EXECUTE FUNCTION shared.trg_increment_row_version();

COMMENT ON TRIGGER trg_pc_row_version ON document.pricing_component IS
    'Increments row_version on every UPDATE to pricing_component. Includes '
    'supersede writes (which only mutate the supersede tuple).';


-- §PC  Polymorphic source validation
DROP TRIGGER IF EXISTS trg_pc_validate_polymorphic_source ON document.pricing_component;
CREATE TRIGGER trg_pc_validate_polymorphic_source
    BEFORE INSERT OR UPDATE OF source_doc_type, source_doc_id, source_line_id
    ON document.pricing_component
    FOR EACH ROW EXECUTE FUNCTION document.fn_pc_validate_polymorphic_source();

COMMENT ON TRIGGER trg_pc_validate_polymorphic_source ON document.pricing_component IS
    'Validates polymorphic source resolves to an existing parent (PI or PIL) per '
    'source_doc_type / source_doc_id / source_line_id, with matching tenant_id.';


-- §PC  Supersede-only gate (parent-status-aware)
DROP TRIGGER IF EXISTS trg_pc_supersede_only_update ON document.pricing_component;
CREATE TRIGGER trg_pc_supersede_only_update
    BEFORE UPDATE ON document.pricing_component
    FOR EACH ROW EXECUTE FUNCTION document.fn_pc_supersede_only_update();

COMMENT ON TRIGGER trg_pc_supersede_only_update ON document.pricing_component IS
    'In draft/rejected: free edits. In approval-stream states: only supersede '
    'tuple may mutate. In terminal states: all edits blocked.';


-- §PC  PIL delete guard (P1.5)
-- ---------------------------------------------------------------------------
-- pricing_component.source_line_id is polymorphic and therefore not protected
-- by a real FK. Without this trigger a raw DELETE on purchase_invoice_line —
-- or any line-handler that bypasses the application-level guard in
-- handleDeleteInvoiceLine — can leave active line-scope PC rows pointing at
-- a vanished parent line. The PC_APPORTION_SUM_DRIFT invariant cannot detect
-- those orphans when the children still sum to the header parent, so DB-side
-- enforcement is the only durable defense.
--
-- This trigger blocks the DELETE; callers must first remove or supersede the
-- referencing PC rows. The application returns 409 LINE_HAS_ACTIVE_PRICING_COMPONENTS
-- with the PC ids; this trigger is the belt-and-suspenders that also covers
-- raw SQL, migrations, and any future handler that forgets the guard.
CREATE OR REPLACE FUNCTION document.fn_pil_block_delete_with_active_pc()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    active_pc_count integer;
    sample_ids      uuid[];
BEGIN
    SELECT count(*), array_agg(pc.id ORDER BY pc.id)
      INTO active_pc_count, sample_ids
      FROM (
          SELECT id
            FROM document.pricing_component
           WHERE tenant_id        = OLD.tenant_id
             AND source_doc_type  = 'purchase_invoice_line'
             AND source_line_id   = OLD.id
             AND superseded_by_id IS NULL
           LIMIT 10
      ) pc;

    IF active_pc_count > 0 THEN
        RAISE EXCEPTION
          'PIL_DELETE_BLOCKED_BY_ACTIVE_PC: cannot delete purchase_invoice_line %; % active pricing_component row(s) reference it via source_line_id (sample ids: %)',
          OLD.id, active_pc_count, sample_ids
          USING ERRCODE = 'PC005';
    END IF;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION document.fn_pil_block_delete_with_active_pc() IS
    'AFTER DELETE on document.purchase_invoice_line: blocks the delete when '
    'active (non-superseded) line-scope PC rows reference the row via '
    'source_line_id. Polymorphic FK substitute; pairs with the application '
    'guard in handleDeleteInvoiceLine (returns 409 LINE_HAS_ACTIVE_PRICING_COMPONENTS).';

DROP TRIGGER IF EXISTS trg_pil_block_delete_with_active_pc ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_block_delete_with_active_pc
    AFTER DELETE ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_pil_block_delete_with_active_pc();

COMMENT ON TRIGGER trg_pil_block_delete_with_active_pc ON document.purchase_invoice_line IS
    'Belt-and-suspenders DB-side guard against orphaning PC rows on line delete. '
    'Raises PC005 with sample PC ids when violated.';


-- =============================================================================
-- End of 06u_pricing_component_triggers.sql
-- =============================================================================
