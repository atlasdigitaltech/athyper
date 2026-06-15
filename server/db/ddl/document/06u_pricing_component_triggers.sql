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


-- =============================================================================
-- End of 06u_pricing_component_triggers.sql
-- =============================================================================
