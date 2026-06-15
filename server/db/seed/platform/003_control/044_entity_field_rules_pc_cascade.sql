-- ============================================================================
-- 044_entity_field_rules_pc_cascade.sql
-- Concept: PC cascade rule for business_intent_id (P1 v1.2)
-- Depends on: 044_entity_field_pricing_component.sql, 01z_entity_field_defaults.sql
-- Spec: docs/specs/purchase_invoice_field_design.md §4
--
-- PC.business_intent_id is the only routing override at the term level.
-- It inherits from the source PIL.business_intent_id (when present);
-- the UI shows "From line" / "Term-specific" inheritance chips.
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

WITH pc_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'pricing_component'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind',          'parent_field',
             'parent_entity', 'purchase_invoice_line',
             'parent_field',  'business_intent_id',
             'apply_on',      jsonb_build_array('create')
         ),
         'override_detection', jsonb_build_object(
             'compare_to',                'parent.business_intent_id',
             'label_when_inherited',      'Line intent',
             'label_when_overridden',     'Term-specific intent',
             'label_when_inherited_null', 'Not set'
         ),
         'on_parent_change', 'preserve',
         'ui_affordance', jsonb_build_object(
             'show_reset_to_default', true,
             'show_inheritance_chip', true,
             'chip_position',         'field_label'
         )
       ),
       updated_at = now()
  FROM pc_version
 WHERE ef.entity_version_id = pc_version.version_id
   AND ef.name              = 'business_intent_id';


-- =============================================================================
-- End of 044_entity_field_rules_pc_cascade.sql
-- =============================================================================

COMMIT;
