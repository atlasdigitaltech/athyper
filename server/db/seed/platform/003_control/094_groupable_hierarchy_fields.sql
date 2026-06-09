-- ============================================================
-- 094_groupable_hierarchy_fields.sql
-- Enables list grouping for low-cardinality hierarchy metadata fields.
--
-- The runtime UI reads control.entity_field.is_groupable to populate the
-- list Group drawer. This patch intentionally enables:
--   - level* numeric fields, such as level_no
--   - parent_code text fields, used by shared code hierarchies
--
-- It intentionally does not enable parent_id / parent_*_id references globally.
-- Those group technically, but each reference needs display metadata so the
-- grouped list header can render a useful label instead of a raw UUID.
--
-- Exception: gl_account.parent_id is enabled below as the reference-label
-- wiring test case. The grouped list header now renders assigned group values
-- through the generic field renderer, so this UUID can resolve through its
-- reference_config instead of being shown raw.
--
-- Idempotent: safe to re-run.
-- Run AFTER: 042_entity_field.sql, 045_entity_field_data_type_normalization.sql
-- ============================================================

UPDATE control.entity_field ef
SET
    is_groupable = true,
    updated_at = now()
FROM control.entity_version ev
JOIN control.entity e
  ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.tenant_id IS NULL
  AND ev.version_no = 1
  AND ef.is_active = true
  AND ef.is_sortable = true
  AND ef.is_groupable = false
  AND (
      (
          ef.name LIKE 'level%'
          AND ef.data_type IN ('integer', 'smallint', 'number')
      )
      OR (
          ef.name = 'parent_code'
          AND ef.data_type = 'text'
      )
  );

WITH gl_account_parent_reference AS (
    SELECT jsonb_build_object(
        'target_entity', 'gl_account',
        'target_field', 'id',
        'display_field', 'name',
        'display_format', 'code_label',
        'picker', jsonb_build_object(
            'code_field', 'code',
            'show_code', true
        )
    ) AS reference_config
)
UPDATE control.entity_field ef
SET
    is_groupable = true,
    reference_config = cfg.reference_config,
    validation = COALESCE(ef.validation, '{}'::jsonb)
                 || jsonb_build_object('ref_entity', 'gl_account'),
    updated_at = now()
FROM control.entity_version ev
JOIN control.entity e
  ON e.id = ev.entity_id
CROSS JOIN gl_account_parent_reference cfg
WHERE ef.entity_version_id = ev.id
  AND e.tenant_id IS NULL
  AND e.entity_code = 'gl_account'
  AND ev.version_no = 1
  AND ef.is_active = true
  AND ef.name = 'parent_id'
  AND (
      ef.is_groupable = false
      OR ef.reference_config IS DISTINCT FROM cfg.reference_config
      OR COALESCE(ef.validation->>'ref_entity', '') IS DISTINCT FROM 'gl_account'
  );
