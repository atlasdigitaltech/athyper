-- ============================================================
-- 093_print_hide_fields.sql
-- Adds "print" to ui_hint.display.hide_in for audit/system fields
-- on site and warehouse entities.
-- Idempotent: safe to re-run (jsonb merge with set logic).
-- Run AFTER: 042_entity_field.sql, 044b_site_warehouse_metadata.sql
-- ============================================================

-- Hide audit-only fields from print for site entity
UPDATE control.entity_field ef
SET
    ui_hint = COALESCE(ui_hint, '{}'::jsonb)
              || jsonb_build_object(
                  'display', jsonb_build_object(
                      'hide_in', (
                          SELECT jsonb_agg(DISTINCT v)
                          FROM (
                              SELECT jsonb_array_elements_text(
                                  COALESCE(ui_hint->'display'->'hide_in', '[]'::jsonb)
                              ) AS v
                              UNION SELECT 'print'
                          ) sub
                      )
                  )
              ),
    updated_at = now()
WHERE ef.name IN (
    'created_by', 'updated_by', 'row_version', 'sync_token',
    'import_ref', 'legacy_ref', 'metadata'
)
AND EXISTS (
    SELECT 1
    FROM control.entity_version ev
    JOIN control.entity e
      ON e.id = ev.entity_id
    WHERE ev.id = ef.entity_version_id
      AND e.entity_code IN ('site', 'warehouse')
      AND e.tenant_id IS NULL
);
