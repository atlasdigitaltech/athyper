-- 20260518_entity_field_contract_cleanup.sql
-- Development-mode cleanup for control.entity_field contract drift.
--
-- Goals:
--   1. Promote runtime presentation fields out of ui_hint:
--        group_key, filter_config
--   2. Keep validation validation-only by moving legacy validation.ref_entity
--      into reference_config.target_entity.
--   3. Strip repeated target-level picker blobs from field reference_config.
--   4. Publish an audit view for remaining contract violations.

ALTER TABLE control.entity_field
    ADD COLUMN IF NOT EXISTS group_key text;

ALTER TABLE control.entity_field
    ADD COLUMN IF NOT EXISTS filter_config jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'ef_group_key_fmt_chk'
           AND conrelid = 'control.entity_field'::regclass
    ) THEN
        ALTER TABLE control.entity_field
            ADD CONSTRAINT ef_group_key_fmt_chk
            CHECK (group_key IS NULL OR group_key ~ '^[a-z][a-z0-9_]*$');
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'ef_filter_config_obj_chk'
           AND conrelid = 'control.entity_field'::regclass
    ) THEN
        ALTER TABLE control.entity_field
            ADD CONSTRAINT ef_filter_config_obj_chk
            CHECK (filter_config IS NULL OR jsonb_typeof(filter_config) = 'object');
    END IF;
END $$;

-- Backfill first-class runtime presentation fields from legacy ui_hint.
UPDATE control.entity_field ef
   SET group_key = NULLIF(ef.ui_hint->>'group_key', '')
 WHERE ef.group_key IS NULL
   AND ef.ui_hint IS NOT NULL
   AND ef.ui_hint ? 'group_key';

UPDATE control.entity_field ef
   SET filter_config = ef.ui_hint->'filter'
 WHERE ef.filter_config IS NULL
   AND ef.ui_hint IS NOT NULL
   AND jsonb_typeof(ef.ui_hint->'filter') = 'object';

-- Remove duplicated runtime contract keys from ui_hint once promoted.
UPDATE control.entity_field ef
   SET ui_hint = NULLIF(
       jsonb_strip_nulls(COALESCE(ef.ui_hint, '{}'::jsonb) - 'group_key' - 'filter'),
       '{}'::jsonb
   )
 WHERE ef.ui_hint IS NOT NULL
   AND ef.ui_hint ?| ARRAY['group_key', 'filter'];

-- Make reference_config the only source for reference target metadata.
WITH ref_fields AS (
    SELECT
        ef.id,
        COALESCE(
            NULLIF(ef.reference_config->>'target_entity', ''),
            NULLIF(ef.reference_config->>'ref_entity', ''),
            NULLIF(ef.validation->>'ref_entity', '')
        ) AS target_entity,
        COALESCE(
            NULLIF(ef.reference_config->>'target_field', ''),
            NULLIF(ef.validation->>'target_field', '')
        ) AS target_field,
        COALESCE(
            NULLIF(ef.reference_config->>'display_field', ''),
            NULLIF(ef.validation->>'display_field', '')
        ) AS display_field
    FROM control.entity_field ef
    WHERE ef.is_active = true
      AND (
          ef.reference_config IS NOT NULL
          OR COALESCE(ef.validation ? 'ref_entity', false)
          OR ef.data_type = 'reference'
          OR ef.ui_type = 'entity_chooser'
      )
)
UPDATE control.entity_field ef
   SET reference_config = jsonb_strip_nulls(
           (COALESCE(ef.reference_config, '{}'::jsonb) - 'ref_entity')
           || jsonb_build_object('target_entity', rf.target_entity)
           || CASE
                WHEN rf.target_field IS NOT NULL AND rf.target_field <> 'id'
                THEN jsonb_build_object('target_field', rf.target_field)
                ELSE '{}'::jsonb
              END
           || CASE
                WHEN rf.display_field IS NOT NULL
                THEN jsonb_build_object('display_field', rf.display_field)
                ELSE '{}'::jsonb
              END
       ),
       validation = NULLIF(
           jsonb_strip_nulls(COALESCE(ef.validation, '{}'::jsonb) - 'ref_entity' - 'target_field' - 'display_field'),
           '{}'::jsonb
       )
  FROM ref_fields rf
 WHERE ef.id = rf.id
   AND rf.target_entity IS NOT NULL
   AND (
       ef.reference_config IS NULL
       OR ef.reference_config ? 'ref_entity'
       OR COALESCE(ef.validation ? 'ref_entity', false)
       OR COALESCE(ef.validation ? 'target_field', false)
       OR COALESCE(ef.validation ? 'display_field', false)
   );

-- Field-level picker is now override-only. Exact copies of the target profile are noise.
UPDATE control.entity_field ef
   SET reference_config = NULLIF(
       jsonb_strip_nulls(COALESCE(ef.reference_config, '{}'::jsonb) - 'picker'),
       '{}'::jsonb
   )
  FROM control.entity e
 WHERE ef.is_active = true
   AND ef.reference_config ? 'picker'
   AND COALESCE(e.entity_code, e.name) = ef.reference_config->>'target_entity'
   AND e.tenant_id IS NULL
   AND COALESCE(e.display_config, '{}'::jsonb) ? 'reference_picker'
   AND ef.reference_config->'picker' = COALESCE(e.display_config, '{}'::jsonb)->'reference_picker';

CREATE OR REPLACE VIEW control.v_entity_field_contract_audit AS
WITH field_context AS (
    SELECT
        COALESCE(e.entity_code, e.name, '<canonical>') AS entity_code,
        ev.version_no,
        ef.id AS entity_field_id,
        ef.name AS field_name,
        ef.column_name,
        ef.data_type,
        ef.ui_type,
        ef.origin,
        ef.reference_config,
        ef.validation,
        ef.ui_hint,
        ef.lookup_profile,
        ef.datetime_config,
        ef.collection_behavior,
        ef.child_entity_name,
        ef.child_fk_field,
        ef.enum_kind,
        ef.fk_on_delete,
        ef.fk_on_update,
        ef.fk_relationship_class,
        ef.constraints,
        e.display_config AS target_display_config
    FROM control.entity_field ef
    LEFT JOIN control.entity_version ev
      ON ev.id = ef.entity_version_id
    LEFT JOIN control.entity e
      ON e.id = ev.entity_id
),
reference_targets AS (
    SELECT
        fc.*,
        target.display_config AS referenced_entity_display_config
    FROM field_context fc
    LEFT JOIN control.entity target
      ON target.tenant_id IS NULL
     AND COALESCE(target.entity_code, target.name) = COALESCE(
         fc.reference_config->>'target_entity',
         fc.reference_config->>'ref_entity',
         fc.validation->>'ref_entity'
     )
)
SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'legacy_validation_ref_entity'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('ref_entity', validation->>'ref_entity') AS details
FROM reference_targets
WHERE validation ? 'ref_entity'

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'legacy_reference_config_ref_entity'::text AS issue_code,
    'error'::text AS severity,
    jsonb_build_object('ref_entity', reference_config->>'ref_entity') AS details
FROM reference_targets
WHERE reference_config ? 'ref_entity'

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'ui_hint_runtime_duplicate'::text AS issue_code,
    'warning'::text AS severity,
    jsonb_strip_nulls(jsonb_build_object(
        'group_key', ui_hint->'group_key',
        'filter', ui_hint->'filter'
    )) AS details
FROM reference_targets
WHERE ui_hint ?| ARRAY['group_key', 'filter']

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'repeated_reference_picker_blob'::text AS issue_code,
    'warning'::text AS severity,
    jsonb_build_object('target_entity', reference_config->>'target_entity') AS details
FROM reference_targets
WHERE reference_config ? 'picker'
  AND COALESCE(referenced_entity_display_config, '{}'::jsonb) ? 'reference_picker'
  AND reference_config->'picker' = COALESCE(referenced_entity_display_config, '{}'::jsonb)->'reference_picker'

UNION ALL

SELECT
    entity_code,
    version_no,
    entity_field_id,
    field_name,
    column_name,
    'reserved_authoring_column_non_null'::text AS issue_code,
    'info'::text AS severity,
    jsonb_strip_nulls(jsonb_build_object(
        'lookup_profile', lookup_profile,
        'datetime_config', datetime_config,
        'collection_behavior', collection_behavior,
        'child_entity_name', child_entity_name,
        'child_fk_field', child_fk_field,
        'enum_kind', enum_kind,
        'fk_on_delete', CASE WHEN fk_on_delete IS DISTINCT FROM 'restrict' THEN fk_on_delete ELSE NULL END,
        'fk_on_update', CASE WHEN fk_on_update IS DISTINCT FROM 'no_action' THEN fk_on_update ELSE NULL END,
        'fk_relationship_class', fk_relationship_class,
        'constraints', constraints
    )) AS details
FROM reference_targets
WHERE jsonb_strip_nulls(jsonb_build_object(
        'lookup_profile', lookup_profile,
        'datetime_config', datetime_config,
        'collection_behavior', collection_behavior,
        'child_entity_name', child_entity_name,
        'child_fk_field', child_fk_field,
        'enum_kind', enum_kind,
        'fk_on_delete', CASE WHEN fk_on_delete IS DISTINCT FROM 'restrict' THEN fk_on_delete ELSE NULL END,
        'fk_on_update', CASE WHEN fk_on_update IS DISTINCT FROM 'no_action' THEN fk_on_update ELSE NULL END,
        'fk_relationship_class', fk_relationship_class,
        'constraints', constraints
    )) <> '{}'::jsonb;

COMMENT ON VIEW control.v_entity_field_contract_audit IS
    'Development audit for control.entity_field contract cleanup. Error rows should be migrated before runtime contract hardening.';

DO $$
DECLARE
    v_errors integer := 0;
    v_warnings integer := 0;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE severity = 'error'),
        COUNT(*) FILTER (WHERE severity = 'warning')
      INTO v_errors, v_warnings
      FROM control.v_entity_field_contract_audit;

    IF v_errors > 0 OR v_warnings > 0 THEN
        RAISE WARNING 'entity_field contract audit: % error(s), % warning(s). Inspect control.v_entity_field_contract_audit.', v_errors, v_warnings;
    ELSE
        RAISE NOTICE 'entity_field contract audit clean';
    END IF;
END $$;
