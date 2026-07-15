-- ============================================================================
-- document/06v_ap_p3_triggers.sql
-- Concept: AP P3 Triggers (HISTORICAL)
--
-- The previous trg_pil_validate_asset_target validated the (asset_treatment,
-- asset_class_id, target_asset_id) triplet. After the 2026-06-22 refactor to
-- the two-field model, the only PIL-tier asset column is asset_class_id;
-- tenant + class FK enforcement is sufficient (see pil_asset_class_fk in
-- 03_constraints.sql). No trigger needed.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_pil_validate_asset_target ON document.purchase_invoice_line;
DROP FUNCTION IF EXISTS document.fn_pil_validate_asset_target();
