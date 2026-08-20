-- seed-pack-version: p2.7-v1
-- Session-local installer for the canonical example graphs. Seed input uses
-- logical field keys; physical authoring UUIDs are deterministic derivatives
-- and are removed from immutable revision payloads.
CREATE OR REPLACE FUNCTION pg_temp.meta_entity_seed_id(p_coordinate text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
    SELECT md5('athyper.meta-entity:p2.7:' || p_coordinate)::uuid;
$$;

CREATE TEMPORARY TABLE IF NOT EXISTS pg_temp.meta_entity_seed_source (
    entity_code text PRIMARY KEY,
    contract_json jsonb NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.meta_entity_release_contract(
    p_contract jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, metadata, pg_temp
AS $$
DECLARE
    v_relation jsonb;
    v_target jsonb;
    v_targets jsonb;
    v_relations jsonb := '[]'::jsonb;
    v_target_entity_id uuid;
BEGIN
    FOR v_relation IN SELECT value FROM jsonb_array_elements(p_contract -> 'relations') LOOP
        v_targets := '[]'::jsonb;
        FOR v_target IN SELECT value FROM jsonb_array_elements(v_relation -> 'targets') LOOP
            SELECT entity.id INTO v_target_entity_id
              FROM metadata.entity AS entity
             WHERE entity.tenant_id IS NULL
               AND entity.entity_code = v_target ->> 'target_entity_code';
            IF v_target_entity_id IS NULL THEN
                RAISE EXCEPTION '[meta-entity P2.7] relation target Entity % is missing',
                    v_target ->> 'target_entity_code';
            END IF;
            v_targets := v_targets || jsonb_build_array(
                (v_target - 'target_entity_code')
                || jsonb_build_object('target_entity_id', v_target_entity_id)
            );
        END LOOP;
        v_relations := v_relations || jsonb_build_array(
            (v_relation - 'targets') || jsonb_build_object('targets', v_targets)
        );
    END LOOP;

    RETURN (p_contract - 'relations') || jsonb_build_object('relations', v_relations);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.meta_master_contract(
    p_storage_object text,
    p_business_fields jsonb,
    p_keys jsonb,
    p_search_profiles jsonb,
    p_relations jsonb,
    p_status_domain text DEFAULT NULL,
    p_status_default text DEFAULT NULL,
    p_storage_plane text DEFAULT 'neon',
    p_storage_schema text DEFAULT 'master'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    WITH standard_fields AS (
        SELECT jsonb_build_array(
            jsonb_build_object(
                'field_key', 'created_at', 'description', 'Creation timestamp.',
                'data_type', 'datetime', 'type_config', '{"kind":"datetime","timezone_mode":"utc"}'::jsonb,
                'cardinality', 'one', 'value_origin', 'stored', 'write_mode', 'write_once',
                'storage_path', 'created_at', 'default_spec', '{"kind":"current_time","apply_on":["create"]}'::jsonb,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'created_by', 'description', 'Principal that created the record.',
                'data_type', 'reference', 'type_config', '{"kind":"reference","identifier_type":"uuid"}'::jsonb,
                'cardinality', 'one', 'value_origin', 'stored', 'write_mode', 'write_once',
                'storage_path', 'created_by', 'default_spec', '{"kind":"principal","apply_on":["create"]}'::jsonb,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'id', 'description', 'Stable record identifier.',
                'data_type', 'uuid', 'type_config', '{"kind":"uuid"}'::jsonb,
                'cardinality', 'one', 'value_origin', 'stored', 'write_mode', 'write_once',
                'storage_path', 'id', 'default_spec', '{"kind":"resolver","resolver_key":"shared.uuidv7","apply_on":["create"]}'::jsonb,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'metadata', 'description', 'Non-authoritative integration metadata.',
                'data_type', 'json', 'type_config', '{"kind":"json","schema_code":"athyper.integration-metadata.v1"}'::jsonb,
                'cardinality', 'one', 'value_origin', 'stored', 'write_mode', 'mutable',
                'storage_path', 'metadata', 'default_spec', '{"kind":"static","value":{},"apply_on":["create"]}'::jsonb,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'tenant_id', 'description', 'Owning tenant boundary.',
                'data_type', 'uuid', 'type_config', '{"kind":"uuid"}'::jsonb,
                'cardinality', 'one', 'value_origin', 'stored', 'write_mode', 'write_once',
                'storage_path', 'tenant_id', 'default_spec', '{"kind":"tenant_context","context_key":"tenant_id","apply_on":["create"]}'::jsonb,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'updated_at', 'description', 'Last database-managed update timestamp.',
                'data_type', 'datetime', 'type_config', '{"kind":"datetime","timezone_mode":"utc"}'::jsonb,
                'cardinality', 'zero_or_one', 'value_origin', 'stored', 'write_mode', 'read_only',
                'storage_path', 'updated_at', 'default_spec', NULL,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'updated_by', 'description', 'Principal responsible for the last update.',
                'data_type', 'reference', 'type_config', '{"kind":"reference","identifier_type":"uuid"}'::jsonb,
                'cardinality', 'zero_or_one', 'value_origin', 'stored', 'write_mode', 'read_only',
                'storage_path', 'updated_by', 'default_spec', NULL,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            )
        ) AS fields
    ), status_fields AS (
        SELECT CASE WHEN p_status_domain IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
            jsonb_build_object(
                'field_key', 'is_active', 'description', 'Database-derived active-state projection.',
                'data_type', 'boolean', 'type_config', '{"kind":"boolean"}'::jsonb,
                'cardinality', 'one', 'value_origin', 'projected', 'write_mode', 'read_only',
                'storage_path', 'is_active', 'default_spec', NULL,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'status', 'description', 'Record lifecycle status.',
                'data_type', 'enum', 'type_config', jsonb_build_object('kind', 'enum', 'domain_code', p_status_domain),
                'cardinality', 'one', 'value_origin', 'stored', 'write_mode', 'mutable',
                'storage_path', 'status', 'default_spec', jsonb_build_object(
                    'kind', 'static', 'value', p_status_default, 'apply_on', jsonb_build_array('create')
                ),
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'status_changed_at', 'description', 'Timestamp of the last lifecycle transition.',
                'data_type', 'datetime', 'type_config', '{"kind":"datetime","timezone_mode":"utc"}'::jsonb,
                'cardinality', 'zero_or_one', 'value_origin', 'stored', 'write_mode', 'read_only',
                'storage_path', 'status_changed_at', 'default_spec', NULL,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            ),
            jsonb_build_object(
                'field_key', 'status_changed_by', 'description', 'Principal responsible for the last lifecycle transition.',
                'data_type', 'reference', 'type_config', '{"kind":"reference","identifier_type":"uuid"}'::jsonb,
                'cardinality', 'zero_or_one', 'value_origin', 'stored', 'write_mode', 'read_only',
                'storage_path', 'status_changed_by', 'default_spec', NULL,
                'computation_spec', NULL, 'validation_spec', NULL, 'status', 'active'
            )
        ) END AS fields
    ), all_fields AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'field_key', field ->> 'field_key',
            'description', field ->> 'description',
            'data_type', field ->> 'data_type',
            'type_config', field -> 'type_config',
            'cardinality', field ->> 'cardinality',
            'value_origin', field ->> 'value_origin',
            'write_mode', field ->> 'write_mode',
            'storage_path', field ->> 'storage_path',
            'default_spec', coalesce(field -> 'default_spec', 'null'::jsonb),
            'computation_spec', coalesce(field -> 'computation_spec', 'null'::jsonb),
            'validation_spec', coalesce(field -> 'validation_spec', 'null'::jsonb),
            'status', coalesce(field ->> 'status', 'active'),
            'replacement_field_key', field ->> 'replacement_field_key',
            'deprecated_since_release_no', (field ->> 'deprecated_since_release_no')::bigint,
            'planned_removal_release_no', (field ->> 'planned_removal_release_no')::bigint
        ) ORDER BY field ->> 'field_key'), '[]'::jsonb) AS fields
          FROM standard_fields, status_fields,
               jsonb_array_elements(standard_fields.fields || status_fields.fields || p_business_fields) AS field
    ), normalized_keys AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'key_key', item ->> 'key_key',
            'key_kind', item ->> 'key_kind',
            'uniqueness_scope', item ->> 'uniqueness_scope',
            'null_semantics', item ->> 'null_semantics',
            'status', coalesce(item ->> 'status', 'active'),
            'replacement_key_key', item ->> 'replacement_key_key',
            'deprecated_since_release_no', (item ->> 'deprecated_since_release_no')::bigint,
            'planned_removal_release_no', (item ->> 'planned_removal_release_no')::bigint,
            'fields', item -> 'fields'
        ) ORDER BY item ->> 'key_key'), '[]'::jsonb) AS items
          FROM jsonb_array_elements(p_keys) AS item
    ), normalized_search AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'search_key', item ->> 'search_key',
            'search_kind', item ->> 'search_kind',
            'query_operator', item ->> 'query_operator',
            'minimum_query_length', (item ->> 'minimum_query_length')::smallint,
            'language_code', item ->> 'language_code',
            'normalization_mode', item ->> 'normalization_mode',
            'is_default', (item ->> 'is_default')::boolean,
            'status', coalesce(item ->> 'status', 'active'),
            'replacement_search_key', item ->> 'replacement_search_key',
            'deprecated_since_release_no', (item ->> 'deprecated_since_release_no')::bigint,
            'planned_removal_release_no', (item ->> 'planned_removal_release_no')::bigint,
            'fields', item -> 'fields'
        ) ORDER BY item ->> 'search_key'), '[]'::jsonb) AS items
          FROM jsonb_array_elements(p_search_profiles) AS item
    ), normalized_relations AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'relation_key', item ->> 'relation_key',
            'relation_kind', item ->> 'relation_kind',
            'resolution_kind', item ->> 'resolution_kind',
            'ownership_mode', item ->> 'ownership_mode',
            'mutation_mode', item ->> 'mutation_mode',
            'on_delete', item ->> 'on_delete',
            'on_update', item ->> 'on_update',
            'inverse_relation_key', item ->> 'inverse_relation_key',
            'status', coalesce(item ->> 'status', 'active'),
            'replacement_relation_key', item ->> 'replacement_relation_key',
            'deprecated_since_release_no', (item ->> 'deprecated_since_release_no')::bigint,
            'planned_removal_release_no', (item ->> 'planned_removal_release_no')::bigint,
            'targets', item -> 'targets'
        ) ORDER BY item ->> 'relation_key'), '[]'::jsonb) AS items
          FROM jsonb_array_elements(p_relations) AS item
    )
    SELECT jsonb_build_object(
        'schema_version', '2.0',
        'runtime_profile', jsonb_build_object(
            'profile_key', 'default', 'backing_kind', 'table',
            'storage_plane', p_storage_plane, 'storage_schema', p_storage_schema,
            'storage_object', p_storage_object, 'api_exposure', 'api',
            'read_mode', 'generic', 'write_mode', 'generic',
            'read_handler_key', NULL, 'write_handler_key', NULL,
            'create_mode', 'direct', 'concurrency_mode', 'none',
            'record_version_field_key', NULL, 'tenant_field_key', 'tenant_id',
            'soft_delete_field_key', NULL, 'draft_ttl_hours', NULL
        ),
        'fields', all_fields.fields,
        'keys', normalized_keys.items,
        'search_profiles', normalized_search.items,
        'relations', normalized_relations.items
    )
      FROM all_fields, normalized_keys, normalized_search, normalized_relations;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_meta_entity_graph(
    p_entity_code text,
    p_entity_class metadata.entity_class_d,
    p_contract jsonb,
    p_change_set_code text DEFAULT 'p2_7_baseline',
    p_publish boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata, snapshot, master, pg_temp
AS $$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_module_id uuid;
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:' || p_entity_code);
    v_change_set_id uuid := pg_temp.meta_entity_seed_id(
        'change-set:' || p_entity_code || ':' || p_change_set_code
    );
    v_row_id uuid;
    v_parent_id uuid;
    v_target_entity_id uuid;
    v_contract jsonb;
    v_item jsonb;
    v_binding jsonb;
    v_target jsonb;
    v_revision_id uuid;
BEGIN
    IF NOT metadata.fn_jsonb_object_has_only_keys(
        p_contract,
        ARRAY['schema_version', 'runtime_profile', 'fields', 'keys', 'search_profiles', 'relations']
    ) OR p_contract ->> 'schema_version' <> '2.0'
       OR jsonb_typeof(p_contract -> 'runtime_profile') <> 'object'
       OR jsonb_typeof(p_contract -> 'fields') <> 'array'
       OR jsonb_typeof(p_contract -> 'keys') <> 'array'
       OR jsonb_typeof(p_contract -> 'search_profiles') <> 'array'
       OR jsonb_typeof(p_contract -> 'relations') <> 'array' THEN
        RAISE EXCEPTION '[meta-entity P2.7] invalid seed graph envelope for %', p_entity_code;
    END IF;

    INSERT INTO pg_temp.meta_entity_seed_source (entity_code, contract_json)
    VALUES (p_entity_code, p_contract)
    ON CONFLICT (entity_code) DO UPDATE
       SET contract_json = EXCLUDED.contract_json;

    SELECT id INTO v_module_id FROM control.module WHERE lower(code) = 'meta';
    IF v_module_id IS NULL THEN
        RAISE EXCEPTION '[meta-entity P2.7] prerequisite control.module META is missing';
    END IF;

    INSERT INTO metadata.entity (
        id, tenant_id, module_id, entity_code, entity_class,
        ownership_model, status, created_by
    ) VALUES (
        v_entity_id, NULL, v_module_id, p_entity_code, p_entity_class,
        'package', 'draft', v_actor
    )
    ON CONFLICT (tenant_id, entity_code) DO NOTHING;

    IF NOT EXISTS (
        SELECT 1 FROM metadata.entity
         WHERE id = v_entity_id
           AND tenant_id IS NULL
           AND module_id = v_module_id
           AND entity_code = p_entity_code
           AND entity_class = p_entity_class
           AND ownership_model = 'package'
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] Entity coordinate drift for %', p_entity_code;
    END IF;

    IF EXISTS (
        SELECT 1 FROM metadata.entity_change_set
         WHERE id = v_change_set_id
    ) THEN
        RETURN;
    END IF;

    INSERT INTO metadata.entity_change_set (
        id, tenant_id, entity_id, change_set_code, branch_code,
        title, change_summary, change_reason_code, created_by
    ) VALUES (
        v_change_set_id, NULL, v_entity_id, p_change_set_code, 'main',
        CASE WHEN p_publish THEN 'P2.7 published example baseline'
             ELSE 'P2.7 editable Studio example' END,
        'Independent canonical Meta Entity example seed.',
        'meta_entity.p2_7_seed',
        v_actor
    );

    PERFORM metadata.fn_advance_entity_change_set(v_change_set_id, 0, v_actor);

    v_item := p_contract -> 'runtime_profile';
    INSERT INTO metadata.entity_runtime_profile (
        id, tenant_id, entity_id, change_set_id, profile_key,
        backing_kind, storage_plane, storage_schema, storage_object,
        api_exposure, read_mode, write_mode, read_handler_key,
        write_handler_key, create_mode, concurrency_mode,
        record_version_field_key, tenant_field_key, soft_delete_field_key,
        draft_ttl_hours, created_by
    ) VALUES (
        pg_temp.meta_entity_seed_id('profile:' || p_entity_code || ':' || p_change_set_code),
        NULL, v_entity_id, v_change_set_id, 'default',
        (v_item ->> 'backing_kind')::metadata.entity_backing_kind_d,
        v_item ->> 'storage_plane', v_item ->> 'storage_schema',
        v_item ->> 'storage_object',
        (v_item ->> 'api_exposure')::metadata.entity_api_exposure_d,
        (v_item ->> 'read_mode')::metadata.entity_read_mode_d,
        (v_item ->> 'write_mode')::metadata.entity_write_mode_d,
        v_item ->> 'read_handler_key', v_item ->> 'write_handler_key',
        (v_item ->> 'create_mode')::metadata.entity_create_mode_d,
        (v_item ->> 'concurrency_mode')::metadata.entity_concurrency_mode_d,
        v_item ->> 'record_version_field_key', v_item ->> 'tenant_field_key',
        v_item ->> 'soft_delete_field_key', (v_item ->> 'draft_ttl_hours')::integer,
        v_actor
    );

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_contract -> 'fields') LOOP
        v_row_id := pg_temp.meta_entity_seed_id(
            'field:' || p_entity_code || ':' || p_change_set_code || ':' || (v_item ->> 'field_key')
        );
        INSERT INTO metadata.entity_field (
            id, tenant_id, entity_id, change_set_id, field_key, description,
            data_type, type_config, cardinality, value_origin, write_mode,
            storage_path, default_spec, computation_spec, validation_spec,
            status, replacement_field_key, deprecated_since_release_no,
            planned_removal_release_no, created_by
        ) VALUES (
            v_row_id, NULL, v_entity_id, v_change_set_id,
            v_item ->> 'field_key', v_item ->> 'description',
            (v_item ->> 'data_type')::metadata.entity_field_data_type_d,
            v_item -> 'type_config',
            (v_item ->> 'cardinality')::metadata.entity_field_cardinality_d,
            (v_item ->> 'value_origin')::metadata.entity_field_value_origin_d,
            (v_item ->> 'write_mode')::metadata.entity_field_write_mode_d,
            v_item ->> 'storage_path', NULLIF(v_item -> 'default_spec', 'null'::jsonb),
            NULLIF(v_item -> 'computation_spec', 'null'::jsonb),
            NULLIF(v_item -> 'validation_spec', 'null'::jsonb),
            coalesce(v_item ->> 'status', 'active')::metadata.entity_member_status_d,
            v_item ->> 'replacement_field_key',
            (v_item ->> 'deprecated_since_release_no')::bigint,
            (v_item ->> 'planned_removal_release_no')::bigint,
            v_actor
        );
    END LOOP;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_contract -> 'keys') LOOP
        v_parent_id := pg_temp.meta_entity_seed_id(
            'key:' || p_entity_code || ':' || p_change_set_code || ':' || (v_item ->> 'key_key')
        );
        INSERT INTO metadata.entity_key (
            id, tenant_id, entity_id, change_set_id, key_key, key_kind,
            uniqueness_scope, null_semantics, status, created_by
        ) VALUES (
            v_parent_id, NULL, v_entity_id, v_change_set_id,
            v_item ->> 'key_key',
            (v_item ->> 'key_kind')::metadata.entity_key_kind_d,
            (v_item ->> 'uniqueness_scope')::metadata.entity_uniqueness_scope_d,
            (v_item ->> 'null_semantics')::metadata.entity_null_semantics_d,
            coalesce(v_item ->> 'status', 'active')::metadata.entity_member_status_d,
            v_actor
        );
        FOR v_binding IN SELECT value FROM jsonb_array_elements(v_item -> 'fields') LOOP
            SELECT id INTO STRICT v_row_id FROM metadata.entity_field
             WHERE change_set_id = v_change_set_id
               AND field_key = v_binding ->> 'field_key';
            INSERT INTO metadata.entity_key_field (
                id, tenant_id, entity_id, change_set_id, entity_key_id,
                entity_field_id, position, created_by
            ) VALUES (
                pg_temp.meta_entity_seed_id(
                    'key-field:' || p_entity_code || ':' || p_change_set_code || ':'
                    || (v_item ->> 'key_key') || ':' || (v_binding ->> 'field_key')
                ),
                NULL, v_entity_id, v_change_set_id, v_parent_id, v_row_id,
                (v_binding ->> 'position')::smallint, v_actor
            );
        END LOOP;
    END LOOP;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_contract -> 'search_profiles') LOOP
        v_parent_id := pg_temp.meta_entity_seed_id(
            'search:' || p_entity_code || ':' || p_change_set_code || ':' || (v_item ->> 'search_key')
        );
        INSERT INTO metadata.entity_search_profile (
            id, tenant_id, entity_id, change_set_id, search_key, search_kind,
            query_operator, minimum_query_length, language_code,
            normalization_mode, is_default, status, created_by
        ) VALUES (
            v_parent_id, NULL, v_entity_id, v_change_set_id,
            v_item ->> 'search_key',
            (v_item ->> 'search_kind')::metadata.entity_search_kind_d,
            (v_item ->> 'query_operator')::metadata.entity_search_operator_d,
            (v_item ->> 'minimum_query_length')::smallint,
            v_item ->> 'language_code',
            (v_item ->> 'normalization_mode')::metadata.entity_search_normalization_d,
            (v_item ->> 'is_default')::boolean,
            coalesce(v_item ->> 'status', 'active')::metadata.entity_member_status_d,
            v_actor
        );
        FOR v_binding IN SELECT value FROM jsonb_array_elements(v_item -> 'fields') LOOP
            SELECT id INTO STRICT v_row_id FROM metadata.entity_field
             WHERE change_set_id = v_change_set_id
               AND field_key = v_binding ->> 'field_key';
            INSERT INTO metadata.entity_search_field (
                id, tenant_id, entity_id, change_set_id,
                entity_search_profile_id, entity_field_id, position,
                match_mode, weight, created_by
            ) VALUES (
                pg_temp.meta_entity_seed_id(
                    'search-field:' || p_entity_code || ':' || p_change_set_code || ':'
                    || (v_item ->> 'search_key') || ':' || (v_binding ->> 'field_key')
                ),
                NULL, v_entity_id, v_change_set_id, v_parent_id, v_row_id,
                (v_binding ->> 'position')::smallint,
                (v_binding ->> 'match_mode')::metadata.entity_search_match_mode_d,
                (v_binding ->> 'weight')::numeric, v_actor
            );
        END LOOP;
    END LOOP;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_contract -> 'relations') LOOP
        v_parent_id := pg_temp.meta_entity_seed_id(
            'relation:' || p_entity_code || ':' || p_change_set_code || ':' || (v_item ->> 'relation_key')
        );
        INSERT INTO metadata.entity_relation (
            id, tenant_id, entity_id, change_set_id, relation_key,
            relation_kind, resolution_kind, ownership_mode, mutation_mode,
            on_delete, on_update, inverse_relation_key, status, created_by
        ) VALUES (
            v_parent_id, NULL, v_entity_id, v_change_set_id,
            v_item ->> 'relation_key',
            (v_item ->> 'relation_kind')::metadata.entity_relation_kind_d,
            (v_item ->> 'resolution_kind')::metadata.entity_relation_resolution_d,
            (v_item ->> 'ownership_mode')::metadata.entity_relation_ownership_d,
            (v_item ->> 'mutation_mode')::metadata.entity_relation_mutation_d,
            (v_item ->> 'on_delete')::metadata.entity_relation_delete_action_d,
            (v_item ->> 'on_update')::metadata.entity_relation_update_action_d,
            v_item ->> 'inverse_relation_key',
            coalesce(v_item ->> 'status', 'active')::metadata.entity_member_status_d,
            v_actor
        );

        FOR v_target IN SELECT value FROM jsonb_array_elements(v_item -> 'targets') LOOP
            SELECT id INTO v_target_entity_id FROM metadata.entity
             WHERE tenant_id IS NULL
               AND entity_code = v_target ->> 'target_entity_code';
            IF v_target_entity_id IS NULL THEN
                RAISE EXCEPTION '[meta-entity P2.7] target % for %.% is missing',
                    v_target ->> 'target_entity_code', p_entity_code,
                    v_item ->> 'relation_key';
            END IF;
            v_row_id := pg_temp.meta_entity_seed_id(
                'relation-target:' || p_entity_code || ':' || p_change_set_code || ':'
                || (v_item ->> 'relation_key') || ':' || (v_target ->> 'relation_target_key')
            );
            INSERT INTO metadata.entity_relation_target (
                id, tenant_id, entity_id, change_set_id, entity_relation_id,
                relation_target_key, target_entity_id, target_key_key,
                discriminator_value, is_default, created_by
            ) VALUES (
                v_row_id, NULL, v_entity_id, v_change_set_id, v_parent_id,
                v_target ->> 'relation_target_key', v_target_entity_id,
                v_target ->> 'target_key_key', v_target ->> 'discriminator_value',
                coalesce((v_target ->> 'is_default')::boolean, false), v_actor
            );
            FOR v_binding IN SELECT value FROM jsonb_array_elements(v_target -> 'fields') LOOP
                SELECT id INTO STRICT v_revision_id FROM metadata.entity_field
                 WHERE change_set_id = v_change_set_id
                   AND field_key = v_binding ->> 'source_field_key';
                INSERT INTO metadata.entity_relation_field (
                    id, tenant_id, entity_id, change_set_id,
                    entity_relation_target_id, source_field_id,
                    target_field_key, position, created_by
                ) VALUES (
                    pg_temp.meta_entity_seed_id(
                        'relation-field:' || p_entity_code || ':' || p_change_set_code || ':'
                        || (v_item ->> 'relation_key') || ':' || (v_target ->> 'relation_target_key')
                        || ':' || (v_binding ->> 'source_field_key')
                    ),
                    NULL, v_entity_id, v_change_set_id, v_row_id, v_revision_id,
                    v_binding ->> 'target_field_key',
                    (v_binding ->> 'position')::smallint, v_actor
                );
            END LOOP;
        END LOOP;
    END LOOP;

    PERFORM metadata.fn_validate_entity_graph(v_change_set_id);

    IF p_publish THEN
        v_contract := pg_temp.meta_entity_release_contract(p_contract);
        v_revision_id := pg_temp.meta_entity_seed_id('revision:' || p_entity_code || ':' || p_change_set_code || ':1');
        INSERT INTO snapshot.entity_contract_revision (
            id, tenant_id, entity_id, change_set_id, revision_no,
            contract_schema_code, contract_schema_version, contract_json,
            contract_hash, revision_hash, payload_size_bytes, changed_paths,
            compatibility_level, validation_status, validation_diagnostics,
            captured_by
        ) VALUES (
            v_revision_id, NULL, v_entity_id, v_change_set_id, 1,
            'athyper.meta-entity', '2.0', v_contract,
            repeat('0', 64), repeat('0', 64), 1, ARRAY['$'],
            'backward_compatible', 'valid', '[]'::jsonb, v_actor
        );

        UPDATE metadata.entity_change_set
           SET status = 'in_review', status_changed_by = v_actor
         WHERE id = v_change_set_id;
        UPDATE metadata.entity_change_set
           SET status = 'approved', status_changed_by = v_actor
         WHERE id = v_change_set_id;

        INSERT INTO metadata.entity_release (
            id, tenant_id, entity_id, change_set_id, revision_id, release_no,
            version_label, release_kind, contract_schema_code,
            contract_schema_version, contract_hash, revision_hash,
            release_hash, compatibility_level, target_planes,
            minimum_runtime_version, publication_reason, published_by
        ) VALUES (
            pg_temp.meta_entity_seed_id('release:' || p_entity_code || ':1'),
            NULL, v_entity_id, v_change_set_id, v_revision_id, 1,
            '1.0.0', 'publish', 'athyper.meta-entity', '2.0',
            repeat('0', 64), repeat('0', 64), repeat('0', 64),
            'backward_compatible', ARRAY['neon'], '1.0.0',
            'P2.7 canonical example baseline.', v_actor
        );

        UPDATE metadata.entity
           SET status = 'active', status_changed_by = v_actor, updated_by = v_actor
         WHERE id = v_entity_id AND status = 'draft';
    END IF;
END;
$$;
