-- 990_reference_picker_config.sql
-- Purpose:
--   Normalize every metadata reference field into a consistent EntityPicker
--   contract. Older seeds may only have validation.ref_entity; newer seeds may
--   have reference_config but no picker hints. This pass makes both shapes
--   produce clear chooser rows: label + code + optional description + view link.

DO $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH ref_fields AS (
    SELECT
      ef.id,
      COALESCE(ef.reference_config, '{}'::jsonb) AS rc,
      ef.validation,
      COALESCE(
        NULLIF(ef.reference_config->>'target_entity', ''),
        NULLIF(ef.reference_config->>'ref_entity', ''),
        NULLIF(ef.validation->>'ref_entity', '')
      ) AS target_entity,
      NULLIF(
        COALESCE(ef.reference_config->>'display_field', ef.validation->>'display_field'),
        ''
      ) AS existing_display_field
    FROM control.entity_field ef
    WHERE ef.is_active = true
      AND (
        ef.reference_config IS NOT NULL
        OR COALESCE(ef.validation ? 'ref_entity', false)
        OR ef.data_type = 'reference'
        OR ef.ui_type = 'entity_chooser'
      )
  ),
  target_meta AS (
    SELECT
      rf.*,
      e.id AS target_entity_id,
      e.display_config,
      e.natural_key_fields,
      ev.id AS target_version_id
    FROM ref_fields rf
    LEFT JOIN control.entity e
      ON COALESCE(e.entity_code, e.name) = rf.target_entity
     AND e.tenant_id IS NULL
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.status = 'EFFECTIVE'
    WHERE rf.target_entity IS NOT NULL
  ),
  resolved AS (
    SELECT
      tm.id,
      tm.rc,
      tm.target_entity,
      COALESCE(NULLIF(tm.rc->>'target_field', ''), 'id') AS target_field,
      COALESCE(
        explicit_label_f.field_name,
        CASE
          WHEN tm.existing_display_field IS NOT NULL
           AND tm.existing_display_field NOT IN ('id', 'code')
           AND tm.existing_display_field IS DISTINCT FROM code_f.field_name
          THEN tm.existing_display_field
          ELSE NULL
        END,
        title_f.field_name,
        name_f.field_name,
        tm.existing_display_field,
        code_f.field_name,
        'id'
      ) AS label_field,
      code_f.field_name AS code_field,
      desc_f.field_name AS description_field,
      COALESCE(
        nav_f.field_name,
        code_f.field_name,
        tm.natural_key_fields[1],
        tm.existing_display_field,
        'id'
      ) AS navigation_field,
      tm.target_entity_id IS NOT NULL AS has_target_entity
    FROM target_meta tm
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = COALESCE(
          NULLIF(tm.rc->'picker'->>'label_field', ''),
          NULLIF(tm.rc->>'label_field', '')
        )
      LIMIT 1
    ) explicit_label_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = NULLIF(tm.display_config->>'title_field', '')
      LIMIT 1
    ) title_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY['name','display_name','title','legal_name']::text[])
      ORDER BY array_position(ARRAY['name','display_name','title','legal_name']::text[], tf.name)
      LIMIT 1
    ) name_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->>'code_field', ''),
          NULLIF(tm.rc->>'code_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->>'code_field', ''),
          NULLIF(tm.rc->>'code_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[], tf.name)
      LIMIT 1
    ) code_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->>'description_field', ''),
          NULLIF(tm.rc->>'description_field', ''),
          'description',
          'display_description',
          'short_description',
          'long_description',
          'summary'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->>'description_field', ''),
          NULLIF(tm.rc->>'description_field', ''),
          'description',
          'display_description',
          'short_description',
          'long_description',
          'summary'
        ]::text[], tf.name)
      LIMIT 1
    ) desc_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->>'navigation_field', ''),
          NULLIF(tm.rc->'picker'->>'record_id_field', ''),
          NULLIF(tm.rc->>'navigation_field', ''),
          NULLIF(tm.rc->>'record_id_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->>'navigation_field', ''),
          NULLIF(tm.rc->'picker'->>'record_id_field', ''),
          NULLIF(tm.rc->>'navigation_field', ''),
          NULLIF(tm.rc->>'record_id_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[], tf.name)
      LIMIT 1
    ) nav_f ON true
  ),
  next_config AS (
    SELECT
      id,
      jsonb_strip_nulls(
        rc
        || jsonb_build_object(
          'target_entity', target_entity,
          'target_field', target_field,
          'display_field', label_field,
          'picker',
            jsonb_strip_nulls(jsonb_build_object(
              'label_field', label_field,
              'code_field', code_field,
              'description_field', description_field,
              'navigation_field', navigation_field,
              'show_code', code_field IS NOT NULL,
              'show_description', description_field IS NOT NULL,
              'show_view_action', has_target_entity
            ))
            || COALESCE(rc->'picker', '{}'::jsonb)
        )
      ) AS reference_config
    FROM resolved
  )
  UPDATE control.entity_field ef
     SET reference_config = nc.reference_config
    FROM next_config nc
   WHERE ef.id = nc.id
     AND ef.reference_config IS DISTINCT FROM nc.reference_config;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '990 reference picker config normalized (% rows updated)', v_updated;
END $$;
