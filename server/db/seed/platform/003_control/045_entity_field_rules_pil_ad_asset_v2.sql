-- ============================================================================
-- 045_entity_field_rules_pil_ad_asset_v2.sql
-- Concept: Field rules + visibility for new PIL + AD asset fields (P3 v1.2)
-- Depends on: 045_entity_field_pil_ad_asset_v2.sql
-- Spec: docs/specs/purchase_invoice_field_design.md §3.2, §3.4, §14, §16
--
-- Edit gates use ['draft','rejected'] (proforma is NOT a status).
-- Visibility predicates use the visible_when shape under ui_hint.display.
-- ============================================================================


-- =============================================================================
-- §P3.8A  PIL editability rules — new asset fields
-- =============================================================================

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
   SET editability = jsonb_build_object(
         'editable_in_status', rule.allowed_statuses,
         'reason',             rule.reason
       ),
       updated_at = now()
  FROM (VALUES
    ('asset_treatment',  jsonb_build_array('draft','rejected')::jsonb,
        'Asset treatment locks at submit — drives AD asset_posting_target.'),
    ('asset_class_id',   jsonb_build_array('draft','rejected')::jsonb,
        'Asset class drives depreciation policy + GL routing; locks at submit.'),
    ('target_asset_id',  jsonb_build_array('draft','rejected')::jsonb,
        'Target asset is the procurement intent; locks at submit.')
  ) AS rule(field_name, allowed_statuses, reason),
       pil_version
 WHERE ef.entity_version_id = pil_version.version_id
   AND ef.name              = rule.field_name;


-- =============================================================================
-- §P3.8B  PIL visibility — conditional on asset_treatment
-- =============================================================================

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
   SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                 || jsonb_build_object(
                      'display', jsonb_build_object(
                          'visible_when', rule.predicate
                      )
                    ),
       visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || jsonb_build_object('when', rule.predicate),
       updated_at = now()
  FROM (VALUES
    -- asset_class_id visible when treatment is NOT 'none'
    ('asset_class_id',
        jsonb_build_object(
            'field',    'asset_treatment',
            'ne',       'none'
        )::jsonb),
    -- target_asset_id visible only when treatment = 'target_asset'
    ('target_asset_id',
        jsonb_build_object(
            'field',    'asset_treatment',
            'eq',       'target_asset'
        )::jsonb)
  ) AS rule(field_name, predicate),
       pil_version
 WHERE ef.entity_version_id = pil_version.version_id
   AND ef.name              = rule.field_name;


-- =============================================================================
-- §P3.8C  AD: new asset fields are system-computed (is_computed=true, set Stage 3)
-- =============================================================================
-- Already flagged is_computed=true in §P3.7B; no editability gate needed.
-- Add visibility so the UI shows them only on capex AD rows.

WITH ad_version AS (
    SELECT ev.id AS version_id
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name   = 'accounting_distribution'
       AND e.tenant_id IS NULL
       AND ev.version_no  = 1
     LIMIT 1
)
UPDATE control.entity_field ef
   SET ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                 || jsonb_build_object(
                      'display', jsonb_build_object(
                          'visible_when', jsonb_build_object('field','is_capex','eq',true)
                      )
                    ),
       visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || jsonb_build_object('when', jsonb_build_object('field','is_capex','eq',true)),
       updated_at = now()
  FROM ad_version
 WHERE ef.entity_version_id = ad_version.version_id
   AND ef.name              IN ('asset_posting_target','target_asset_id');


-- =============================================================================
-- End of 045_entity_field_rules_pil_ad_asset_v2.sql
-- =============================================================================

COMMIT;
