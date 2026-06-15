-- ============================================================================
-- control/01z_entity_field_defaults.sql
-- Concept: Cascade metadata column on control.entity_field (v1.2 P9)
-- Depends on: control/01_tables.sql (entity_field at line 2051)
-- Spec: docs/specs/purchase_invoice_field_design.md §4 (Cascade Interpretation)
--
-- This column replaces ~30 hypothetical per-field origin columns on document
-- tables. DB stores facts; entity-metadata layer expresses semantic
-- interpretation (default-from-parent, override detection, parent-change
-- behavior, UI affordances).
--
-- Drives:
--   • Form runtime — on-create default fill + inheritance chip + reset button
--   • BFF projection — virtual _inheritance block in API responses
--   • UI rendering — "From header" / "Overridden" labels
--
-- Schema:
--   {
--     "default_value_source": {
--       "kind": "parent_field" | "tenant_config" | "supplier_config" | "static",
--       "parent_entity": "<entity_code>",      // when kind=parent_field
--       "parent_field":  "<field_name>",       // when kind=parent_field
--       "static_value":  <any>,                // when kind=static
--       "config_key":    "<dotted.path>",      // when kind=*_config
--       "apply_on":      ["create" | "reset"]
--     },
--     "override_detection": {
--       "compare_to":               "parent.<field>",
--       "label_when_inherited":     "<text>",
--       "label_when_overridden":    "<text>",
--       "label_when_inherited_null": "<text>"
--     },
--     "on_parent_change": "preserve" | "prompt" | "inherit" | "recompute",
--     "ui_affordance": {
--       "show_reset_to_default":  <boolean>,
--       "show_inheritance_chip":  <boolean>,
--       "chip_position": "field_label" | "field_value" | "none"
--     }
--   }
-- ============================================================================

ALTER TABLE control.entity_field
    ADD COLUMN IF NOT EXISTS defaults jsonb;

COMMENT ON COLUMN control.entity_field.defaults IS
    'Cascade semantics. Drives form runtime on-create default fill, BFF inheritance '
    'projection, and UI override-detection chip rendering. Replaces ~30 hypothetical '
    'per-field origin columns on document tables. See docs/specs/purchase_invoice_field_design.md §4.';

-- Coverage index: find all cascade rules per entity quickly
CREATE INDEX IF NOT EXISTS ix_entity_field_defaults
    ON control.entity_field (entity_version_id, name)
    WHERE defaults IS NOT NULL;


-- =============================================================================
-- End of 01z_entity_field_defaults.sql
-- =============================================================================
