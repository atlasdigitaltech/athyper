-- ============================================================================
-- 043_entity_field_rules_pi_pil_cascade.sql
-- Concept: PI → PIL cascade rules (v1.2 P9)
-- Depends on: control.entity_field.defaults column (01z_entity_field_defaults.sql)
-- Spec: docs/specs/purchase_invoice_field_design.md §4 (Cascade Interpretation)
--
-- Seeds the defaults JSONB on PIL fields that cascade from PI on row-create
-- and where override-detection drives the UI inheritance chip.
--
-- Fields covered (6):
--   • cost_center_id
--   • profit_center_id
--   • project_id
--   • site_id
--   • budget_allocation_id  (PIL column added in 01t_ap_p0_foundations.sql)
--   • business_intent_id
--
-- PC.business_intent_id cascade rule is seeded in P1 alongside the PC table.
--
-- Trigger bypass: control.trg_ef_invalidate fires on every entity_field UPDATE
-- and references NEW.entity_id (which doesn't exist on entity_field — known
-- repo bug). Setting app.bypass_version_lock=true short-circuits the trigger.
-- See server/db/scripts/provision.ts for the equivalent session-wide setting.
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

WITH pil_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind',          'parent_field',
             'parent_entity', 'purchase_invoice',
             'parent_field',  rule.parent_field,
             'apply_on',      jsonb_build_array('create')
         ),
         'override_detection', jsonb_build_object(
             'compare_to',                'parent.' || rule.parent_field,
             'label_when_inherited',      'From header',
             'label_when_overridden',     'Overridden',
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
  FROM (VALUES
    -- PIL field name             | parent (PI) field name
    ('cost_center_id',              'cost_center_id'),
    ('profit_center_id',            'profit_center_id'),
    ('project_id',                  'project_id'),
    ('site_id',                     'site_id'),
    ('budget_allocation_id',        'budget_allocation_id'),
    ('business_intent_id',          'cost_center_id')  -- intent doesn't cascade from header directly; placeholder until line→commodity intent flow is wired
  ) AS rule(pil_field, parent_field),
       pil_version
 WHERE ef.entity_version_id = pil_version.version_id
   AND ef.name              = rule.pil_field;

-- Repair business_intent_id rule (no parent-field cascade today — it is line-set)
WITH pil_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind',          'static',
             'static_value',  NULL,
             'apply_on',      jsonb_build_array('create')
         ),
         'override_detection', NULL,
         'on_parent_change', 'preserve',
         'ui_affordance', jsonb_build_object(
             'show_reset_to_default', false,
             'show_inheritance_chip', false,
             'chip_position',         'none'
         )
       ),
       updated_at = now()
  FROM pil_version
 WHERE ef.entity_version_id = pil_version.version_id
   AND ef.name              = 'business_intent_id';


-- Coverage check (informational — verify-cascade-rule-coverage.ts enforces in CI):
-- SELECT name, defaults->'default_value_source'->>'kind' AS source_kind
--   FROM control.entity_field
--  WHERE entity_version_id = (... pil_version ...)
--    AND name IN ('cost_center_id','profit_center_id','project_id','site_id',
--                 'budget_allocation_id','business_intent_id')
--    AND defaults IS NOT NULL;
-- Expected: 6 rows.


-- =============================================================================
-- End of 043_entity_field_rules_pi_pil_cascade.sql
-- =============================================================================

COMMIT;
