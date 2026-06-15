-- ============================================================================
-- 045_entity_field_pil_ad_asset_v2.sql
-- Concept: Register new PIL + AD asset fields (P3 v1.2)
-- Depends on: 040_entity.sql, 041_entity_version.sql, 042_entity_field.sql
-- Spec: docs/specs/purchase_invoice_field_design.md §3.2, §3.4
--
-- Adds:
--   • purchase_invoice_line.asset_treatment    (text, enum)
--   • purchase_invoice_line.asset_class_id     (uuid → master.asset_class)
--   • purchase_invoice_line.target_asset_id    (uuid → master.asset)
--   • accounting_distribution.asset_posting_target (text, enum, frozen at Stage 3)
--   • accounting_distribution.target_asset_id      (uuid → master.asset, frozen at Stage 3)
--
-- Deactivates (does NOT drop — P5 handles physical drop):
--   • purchase_invoice_line.is_asset
--   • purchase_invoice_line.asset_category_id
-- ============================================================================


-- =============================================================================
-- §P3.7A  PIL: register new asset fields
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
INSERT INTO control.entity_field (
    tenant_id, entity_version_id,
    name, column_name, label,
    data_type, ui_type,
    cardinality, origin,
    is_required, is_read_only, is_computed, is_write_once,
    compute_mode,
    group_key,
    is_active,
    created_by
)
SELECT NULL, pil_version.version_id,
       v.name, v.column_name, v.label,
       v.data_type, v.ui_type,
       'one', CASE WHEN v.origin = 'business' THEN 'standard' ELSE v.origin END,
       v.is_required,
       CASE WHEN v.is_write_once THEN false ELSE v.is_read_only END,
       v.is_computed, v.is_write_once,
       v.compute_mode,
       v.group_key,
       true,
       '00000000-0000-0000-0000-000000000000'
  FROM pil_version,
       (VALUES
    ('asset_treatment',  'asset_treatment',  'Asset Treatment', 'text', 'enum',      'business', false, false, false, false, NULL, 'asset'),
    ('asset_class_id',   'asset_class_id',   'Asset Class',     'uuid', 'reference', 'business', false, false, false, false, NULL, 'asset'),
    ('target_asset_id',  'target_asset_id',  'Target Asset',    'uuid', 'reference', 'business', false, false, false, false, NULL, 'asset')
  ) AS v(name, column_name, label, data_type, ui_type, origin,
          is_required, is_read_only, is_computed, is_write_once, compute_mode, group_key)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- §P3.7B  AD: register new asset frozen fields
-- =============================================================================

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
INSERT INTO control.entity_field (
    tenant_id, entity_version_id,
    name, column_name, label,
    data_type, ui_type,
    cardinality, origin,
    is_required, is_read_only, is_computed, is_write_once,
    compute_mode,
    group_key,
    is_active,
    created_by
)
SELECT NULL, ad_version.version_id,
       v.name, v.column_name, v.label,
       v.data_type, v.ui_type,
       'one', 'system',
       false, true, true, false,
       'service',
       'asset',
       true,
       '00000000-0000-0000-0000-000000000000'
  FROM ad_version,
       (VALUES
    ('asset_posting_target',  'asset_posting_target',  'Asset Posting Target', 'text', 'enum'),
    ('target_asset_id',       'target_asset_id',       'Target Asset',         'uuid', 'reference')
  ) AS v(name, column_name, label, data_type, ui_type)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- §P3.7C  Deactivate legacy PIL fields (is_asset, asset_category_id)
-- =============================================================================
-- Physical drop is deferred to P5 (after reader migration). Setting is_active=false
-- causes the form runtime to suppress them.

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
   SET is_active  = false,
       updated_at = now()
  FROM pil_version
 WHERE ef.entity_version_id = pil_version.version_id
   AND ef.name              IN ('is_asset','asset_category_id');


-- =============================================================================
-- End of 045_entity_field_pil_ad_asset_v2.sql
-- =============================================================================

COMMIT;
