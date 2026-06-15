-- ============================================================================
-- document/06v_ap_p3_triggers.sql
-- Concept: AP P3 Triggers — PIL asset target validation
-- Depends on: 01w_ap_p3_asset_refactor.sql (fn_pil_validate_asset_target)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.2, §8
-- ============================================================================

DROP TRIGGER IF EXISTS trg_pil_validate_asset_target ON document.purchase_invoice_line;
CREATE TRIGGER trg_pil_validate_asset_target
    BEFORE INSERT OR UPDATE OF asset_treatment, asset_class_id, target_asset_id, metadata
    ON document.purchase_invoice_line
    FOR EACH ROW EXECUTE FUNCTION document.fn_pil_validate_asset_target();

COMMENT ON TRIGGER trg_pil_validate_asset_target ON document.purchase_invoice_line IS
    'Validates asset_treatment + asset_class_id + target_asset_id triplet on PIL. '
    'Checks target_asset tenant + company_code + class consistency, plus '
    'master.asset_class.useful_life_override_policy. Fires only when relevant '
    'columns or metadata change.';


-- =============================================================================
-- End of 06v_ap_p3_triggers.sql
-- =============================================================================
