/* ============================================================================
   Athyper — Compile entity snapshots into meta.entity_compiled

   For every entity_version that has NO compiled snapshot, assembles a JSON
   document containing: entity metadata, fields, relations, indexes, lifecycle,
   and operations — then inserts into meta.entity_compiled.

   The compiled_hash is an MD5 of the JSON payload for cache invalidation.
   Runs for ALL tenants. Idempotent (ON CONFLICT DO NOTHING).
   ============================================================================ */

DO $$
DECLARE
    v_tenant      uuid;
    v_ev          record;
    v_json        jsonb;
    v_hash        text;
    v_inserted    int := 0;
    v_total       int := 0;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant
    LOOP
        FOR v_ev IN
            SELECT ev.id       AS version_id,
                   ev.entity_id,
                   ev.version_no,
                   ev.status,
                   ev.published_at,
                   e.name       AS entity_name,
                   e.kind,
                   e.table_schema,
                   e.table_name,
                   e.module_id,
                   e.entity_short,
                   e.entity_code,
                   e.slug,
                   e.entity_class,
                   e.governance_level,
                   e.engine_tag,
                   e.naming_policy,
                   e.feature_flags
            FROM meta.entity_version ev
            JOIN meta.entity e ON e.id = ev.entity_id AND e.tenant_id = ev.tenant_id
            WHERE ev.tenant_id = v_tenant
              -- Only versions with no compiled snapshot
              AND NOT EXISTS (
                  SELECT 1 FROM meta.entity_compiled ec
                  WHERE ec.entity_version_id = ev.id AND ec.tenant_id = ev.tenant_id
              )
            ORDER BY e.name, ev.version_no
        LOOP
            v_total := v_total + 1;

            -- Assemble compiled JSON
            v_json := jsonb_build_object(
                'entity', jsonb_build_object(
                    'id',              v_ev.entity_id,
                    'name',            v_ev.entity_name,
                    'kind',            v_ev.kind,
                    'tableSchema',     v_ev.table_schema,
                    'tableName',       v_ev.table_name,
                    'moduleId',        v_ev.module_id,
                    'entityShort',     v_ev.entity_short,
                    'entityCode',      v_ev.entity_code,
                    'slug',            v_ev.slug,
                    'entityClass',     v_ev.entity_class,
                    'governanceLevel', v_ev.governance_level,
                    'engineTag',       v_ev.engine_tag,
                    'namingPolicy',    v_ev.naming_policy,
                    'featureFlags',    v_ev.feature_flags
                ),
                'version', jsonb_build_object(
                    'id',          v_ev.version_id,
                    'versionNo',   v_ev.version_no,
                    'status',      v_ev.status,
                    'publishedAt', v_ev.published_at
                ),
                'fields', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',          f.id,
                            'name',        f.name,
                            'columnName',  f.column_name,
                            'dataType',    f.data_type,
                            'uiType',      f.ui_type,
                            'isRequired',  f.is_required,
                            'sortOrder',   f.sort_order,
                            'origin',      f.origin,
                            'isReadOnly',  f.is_read_only,
                            'isComputed',  f.is_computed,
                            'writeOnce',   f.write_once
                        ) ORDER BY f.sort_order
                    )
                    FROM meta.field f
                    WHERE f.entity_version_id = v_ev.version_id
                      AND f.tenant_id = v_tenant
                ), '[]'::jsonb),
                'relations', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',            r.id,
                            'name',          r.name,
                            'relationKind',  r.relation_kind,
                            'targetEntity',  r.target_entity,
                            'fkField',       r.fk_field,
                            'targetKey',     r.target_key,
                            'onDelete',      r.on_delete
                        ) ORDER BY r.name
                    )
                    FROM meta.relation r
                    WHERE r.entity_version_id = v_ev.version_id
                      AND r.tenant_id = v_tenant
                ), '[]'::jsonb),
                'indexes', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',          i.id,
                            'name',        i.name,
                            'isUnique',    i.is_unique,
                            'method',      i.method,
                            'columns',     i.columns,
                            'whereClause', i.where_clause
                        ) ORDER BY i.name
                    )
                    FROM meta.index_def i
                    WHERE i.entity_version_id = v_ev.version_id
                      AND i.tenant_id = v_tenant
                ), '[]'::jsonb),
                'lifecycles', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',          el.id,
                            'lifecycleId', el.lifecycle_id,
                            'priority',    el.priority,
                            'conditions',  el.conditions
                        ) ORDER BY el.priority
                    )
                    FROM meta.entity_lifecycle el
                    WHERE el.entity_name = v_ev.entity_name
                      AND el.tenant_id = v_tenant
                ), '[]'::jsonb),
                'operations', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id',             eo.id,
                            'operationCode',  eo.operation_code,
                            'surface',        eo.surface,
                            'placement',      eo.placement,
                            'handlerType',    eo.handler_type,
                            'handlerTarget',  eo.handler_target,
                            'requiresRecord', eo.requires_record,
                            'sortOrder',      eo.sort_order,
                            'isEnabled',      eo.is_enabled
                        ) ORDER BY eo.sort_order
                    )
                    FROM meta.entity_operation eo
                    WHERE eo.entity_name = v_ev.entity_name
                      AND (eo.tenant_id = v_tenant OR eo.tenant_id IS NULL)
                ), '[]'::jsonb),
                'compiledAt', now()
            );

            -- Compute hash for cache invalidation
            v_hash := md5(v_json::text);

            INSERT INTO meta.entity_compiled (
                tenant_id, entity_version_id,
                compiled_json, compiled_hash, created_by
            ) VALUES (
                v_tenant, v_ev.version_id,
                v_json, v_hash, 'system'
            )
            ON CONFLICT (tenant_id, entity_version_id, compiled_hash) DO NOTHING;

            v_inserted := v_inserted + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Entity compilation complete: % snapshots compiled out of % versions processed',
        v_inserted, v_total;
END $$;
