-- =============================================================================
-- Entity version hash backfill
-- =============================================================================
-- Scope:
--   * Platform/global metadata only: entity.tenant_id IS NULL,
--     entity_version.tenant_id IS NULL.
--   * Standard schemas only: control, document, master, shared.
--   * Tenant custom fields attached to a platform version are intentionally
--     excluded from the global version hash.
--
-- Contract:
--   version_hash is a deterministic SHA-256 fingerprint for the entity version
--   definition used by compiled metadata cache invalidation. It includes the
--   version identity, version behaviours, the owning physical entity, and active
--   platform fields in stable sort order.

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_updated integer := 0;
BEGIN
    WITH version_payload AS (
        SELECT
            ev.id AS entity_version_id,
            jsonb_build_object(
                'version', jsonb_build_object(
                    'id', ev.id,
                    'entity_id', ev.entity_id,
                    'version_no', ev.version_no,
                    'behaviors', ev.behaviors
                ),
                'entity', jsonb_build_object(
                    'entity_code', e.entity_code,
                    'name', e.name,
                    'slug', e.slug,
                    'entity_class', e.entity_class,
                    'table_schema', e.table_schema,
                    'table_name', e.table_name,
                    'backing_type', e.backing_type
                ),
                'fields', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', ef.id,
                            'name', ef.name,
                            'column_name', ef.column_name,
                            'label', ef.label,
                            'description', ef.description,
                            'data_type', ef.data_type,
                            'ui_type', ef.ui_type,
                            'format', ef.format,
                            'unit', ef.unit,
                            'cardinality', ef.cardinality,
                            'origin', ef.origin,
                            'is_required', ef.is_required,
                            'is_unique', ef.is_unique,
                            'unique_scope', ef.unique_scope,
                            'is_searchable', ef.is_searchable,
                            'is_filterable', ef.is_filterable,
                            'is_sortable', ef.is_sortable,
                            'is_groupable', ef.is_groupable,
                            'is_aggregatable', ef.is_aggregatable,
                            'is_read_only', ef.is_read_only,
                            'is_deprecated', ef.is_deprecated,
                            'is_computed', ef.is_computed,
                            'is_write_once', ef.is_write_once,
                            'compute_mode', ef.compute_mode,
                            'compute_expr', ef.compute_expr,
                            'enum_config', ef.enum_config,
                            'enum_domain_code', ef.enum_domain_code,
                            'enum_kind', ef.enum_kind,
                            'reference_config', ef.reference_config,
                            'fk_target_entity_id', ef.fk_target_entity_id,
                            'fk_target_field', ef.fk_target_field,
                            'fk_on_delete', ef.fk_on_delete,
                            'fk_on_update', ef.fk_on_update,
                            'fk_relationship_class', ef.fk_relationship_class,
                            'json_config', ef.json_config,
                            'money_config', ef.money_config,
                            'datetime_config', ef.datetime_config,
                            'ui_hint', ef.ui_hint,
                            'visibility', ef.visibility,
                            'editability', ef.editability,
                            'lookup_config', ef.lookup_config,
                            'lookup_profile', ef.lookup_profile,
                            'child_entity_name', ef.child_entity_name,
                            'child_fk_field', ef.child_fk_field,
                            'collection_behavior', ef.collection_behavior,
                            'validation', ef.validation,
                            'constraints', ef.constraints,
                            'default_value', ef.default_value,
                            'sort_order', ef.sort_order
                        )
                        ORDER BY ef.sort_order, ef.name, ef.id
                    )
                    FROM control.entity_field ef
                    WHERE ef.entity_version_id = ev.id
                      AND ef.tenant_id IS NULL
                      AND ef.is_active = true
                ), '[]'::jsonb)
            ) AS payload
        FROM control.entity_version ev
        JOIN control.entity e
          ON e.id = ev.entity_id
        WHERE ev.tenant_id IS NULL
          AND e.tenant_id IS NULL
          AND e.table_schema IN ('control', 'document', 'master', 'shared')
    ),
    computed_hash AS (
        SELECT
            entity_version_id,
            encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') AS version_hash
        FROM version_payload
    )
    UPDATE control.entity_version ev
       SET version_hash = ch.version_hash,
           updated_at   = now(),
           updated_by   = v_su
      FROM computed_hash ch
     WHERE ev.id = ch.entity_version_id
       AND ev.tenant_id IS NULL
       AND ev.version_hash IS DISTINCT FROM ch.version_hash;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Backfilled/normalized entity_version.version_hash for % platform version rows', v_updated;
END $$;
