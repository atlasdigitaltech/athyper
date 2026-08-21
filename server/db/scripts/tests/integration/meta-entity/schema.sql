\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relkind = 'r'
       AND relation.relname = ANY (ARRAY[
            'entity_class_profile',
            'entity_runtime_profile',
            'entity_field',
            'entity_key',
            'entity_key_field',
            'entity_search_profile',
            'entity_search_field',
            'entity_relation',
            'entity_relation_target',
            'entity_relation_field'
       ]);
    IF v_count <> 10 THEN
        RAISE EXCEPTION 'Expected 10 Phase 2 metadata tables; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'metadata'
       AND relation.relname = ANY (ARRAY[
            'entity_class_profile',
            'entity_runtime_profile',
            'entity_field',
            'entity_key',
            'entity_key_field',
            'entity_search_profile',
            'entity_search_field',
            'entity_relation',
            'entity_relation_target',
            'entity_relation_field'
       ])
       AND relation.relrowsecurity
       AND relation.relforcerowsecurity;
    IF v_count <> 10 THEN
        RAISE EXCEPTION 'Every Phase 2 metadata table must have enabled and forced RLS; found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'metadata'
       AND procedure.proname = ANY (ARRAY[
            'fn_jsonb_object_has_only_keys',
            'fn_advance_entity_change_set',
            'trg_guard_entity_graph_row',
            'trg_validate_entity_graph_binding',
            'trg_validate_entity_field_contract',
            'fn_validate_entity_graph',
            'trg_validate_entity_graph_deferred',
            'trg_reject_entity_class_profile_mutation'
       ])
       AND EXISTS (
            SELECT 1 FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting
             WHERE setting LIKE 'search_path=%'
       );
    IF v_count <> 8 THEN
        RAISE EXCEPTION 'Every Phase 2 function must fix search_path; found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'metadata'
           AND table_name = 'entity_field'
           AND column_name = ANY (ARRAY[
                'is_required', 'is_unique', 'is_searchable', 'is_filterable',
                'is_sortable', 'ui_type', 'ui_hint', 'reference_config',
                'enum_config', 'money_config', 'datetime_config'
           ])
    ) THEN
        RAISE EXCEPTION 'Legacy duplicate field properties leaked into metadata.entity_field';
    END IF;
END;
$$;

INSERT INTO master.tenant (
    id, code, name, display_name, realm_key, status, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'meta_p2', 'Meta Entity Phase 2', 'Meta Entity Phase 2', 'meta_p2', 'active',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO master.principal (
    id, tenant_id, code, name, principal_type, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'meta.p2.admin', 'Meta Entity Phase 2 Admin', 'user',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO control.workspace (
    id, code, name, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000003',
    'meta_p2_workspace', 'Meta Entity Phase 2 Workspace',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO control.module (
    id, code, name, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000004',
    'meta_p2_module', 'Meta Entity Phase 2 Module',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO control.workspace_module (
    workspace_id, module_id, is_primary, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000004',
    true,
    '10000000-0000-0000-0000-000000000002'
);

SELECT set_config('app.current_tenant_id', '10000000-0000-0000-0000-000000000001', true);
SELECT set_config('app.current_principal_id', '10000000-0000-0000-0000-000000000002', true);

INSERT INTO metadata.entity (
    id, tenant_id, module_id, entity_code, entity_class, ownership_model, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'phase2_contract', 'business', 'tenant',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_change_set (
    id, tenant_id, entity_id, change_set_code, title, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    'phase2.initial', 'Phase 2 initial graph',
    '10000000-0000-0000-0000-000000000002'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO metadata.entity_field (
            tenant_id, entity_id, change_set_id, field_key, data_type,
            type_config, storage_path, created_by
        ) VALUES (
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000005',
            '10000000-0000-0000-0000-000000000006',
            'must_fail_without_token', 'string', '{"kind":"string"}',
            'must_fail_without_token',
            '10000000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Graph write unexpectedly bypassed the optimistic write token';
    EXCEPTION WHEN serialization_failure THEN
        NULL;
    END;
END;
$$;

SELECT metadata.fn_advance_entity_change_set(
    '10000000-0000-0000-0000-000000000006', 0,
    '10000000-0000-0000-0000-000000000002'
);

DO $$
BEGIN
    BEGIN
        PERFORM metadata.fn_advance_entity_change_set(
            '10000000-0000-0000-0000-000000000006', 0,
            '10000000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Stale optimistic lock unexpectedly advanced';
    EXCEPTION WHEN serialization_failure THEN
        NULL;
    END;
END;
$$;

INSERT INTO metadata.entity_runtime_profile (
    id, tenant_id, entity_id, change_set_id, backing_kind, storage_plane,
    storage_schema, storage_object, api_exposure, read_mode, write_mode,
    create_mode, concurrency_mode, record_version_field_key, tenant_field_key,
    created_by
) VALUES (
    '10000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    'table', 'neon', 'document', 'phase2_contract', 'api', 'generic', 'generic',
    'direct', 'optimistic', 'row_version', 'tenant_id',
    '10000000-0000-0000-0000-000000000002'
);

DO $$
BEGIN
    BEGIN
        INSERT INTO metadata.entity_field (
            tenant_id, entity_id, change_set_id, field_key, data_type,
            type_config, storage_path, created_by
        ) VALUES (
            '10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000005',
            '10000000-0000-0000-0000-000000000006',
            'must_fail_unknown_property', 'string',
            '{"kind":"string","ui_type":"text"}',
            'must_fail_unknown_property',
            '10000000-0000-0000-0000-000000000002'
        );
        RAISE EXCEPTION 'Unknown field contract property unexpectedly passed';
    EXCEPTION WHEN invalid_parameter_value THEN
        NULL;
    END;
END;
$$;

INSERT INTO metadata.entity_field (
    id, tenant_id, entity_id, change_set_id, field_key, description, data_type,
    type_config, cardinality, value_origin, write_mode, storage_path,
    validation_spec, created_by
) VALUES
    ('10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006', 'id', 'Stable row identifier', 'uuid', '{"kind":"uuid"}', 'one', 'stored', 'write_once', 'id', NULL, '10000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006', 'tenant_id', 'Tenant isolation identifier', 'uuid', '{"kind":"uuid"}', 'one', 'stored', 'write_once', 'tenant_id', NULL, '10000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006', 'row_version', 'Optimistic row version', 'bigint', '{"kind":"bigint","minimum":0}', 'one', 'stored', 'mutable', 'row_version', NULL, '10000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006', 'code', 'Business code', 'string', '{"kind":"string","min_length":2,"max_length":64}', 'one', 'stored', 'mutable', 'code', '{"schema_version":1,"rules":[{"code":"code.length","kind":"length","parameters":{"minimum":2,"maximum":64},"severity":"error"}]}', '10000000-0000-0000-0000-000000000002'),
    ('10000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006', 'parent_id', 'Optional parent identifier', 'reference', '{"kind":"reference","identifier_type":"uuid"}', 'zero_or_one', 'stored', 'mutable', 'parent_id', NULL, '10000000-0000-0000-0000-000000000002');

INSERT INTO metadata.entity_key (
    id, tenant_id, entity_id, change_set_id, key_key, key_kind,
    uniqueness_scope, null_semantics, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    'primary', 'primary', 'tenant', 'not_allowed',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_key_field (
    tenant_id, entity_id, change_set_id, entity_key_id, entity_field_id,
    position, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000010', 1,
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_search_profile (
    id, tenant_id, entity_id, change_set_id, search_key, search_kind,
    query_operator, minimum_query_length, normalization_mode, is_default,
    created_by
) VALUES (
    '10000000-0000-0000-0000-000000000030',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    'default', 'keyword', 'and', 2, 'casefold', true,
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_search_field (
    tenant_id, entity_id, change_set_id, entity_search_profile_id,
    entity_field_id, position, match_mode, weight, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000030',
    '10000000-0000-0000-0000-000000000013', 1, 'prefix', 2.000,
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_relation (
    id, tenant_id, entity_id, change_set_id, relation_key, relation_kind,
    resolution_kind, ownership_mode, mutation_mode, on_delete, on_update,
    created_by
) VALUES (
    '10000000-0000-0000-0000-000000000040',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    'parent', 'many_to_one', 'foreign_key', 'reference', 'source_owned',
    'set_null', 'cascade',
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_relation_target (
    id, tenant_id, entity_id, change_set_id, entity_relation_id,
    relation_target_key, target_entity_id, target_key_key, is_default,
    created_by
) VALUES (
    '10000000-0000-0000-0000-000000000041',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000040',
    'default', '10000000-0000-0000-0000-000000000005', 'primary', true,
    '10000000-0000-0000-0000-000000000002'
);

INSERT INTO metadata.entity_relation_field (
    tenant_id, entity_id, change_set_id, entity_relation_target_id,
    source_field_id, target_field_key, position, created_by
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000041',
    '10000000-0000-0000-0000-000000000014', 'id', 1,
    '10000000-0000-0000-0000-000000000002'
);

SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
    IF (SELECT lock_version FROM metadata.entity_change_set
         WHERE id = '10000000-0000-0000-0000-000000000006') <> 1 THEN
        RAISE EXCEPTION 'A multi-row graph save must advance the lock exactly once';
    END IF;
    IF (SELECT count(*) FROM metadata.entity_field
         WHERE change_set_id = '10000000-0000-0000-0000-000000000006') <> 5 THEN
        RAISE EXCEPTION 'Expected the complete five-field smoke graph';
    END IF;
END;
$$;

SET LOCAL ROLE athyperapp;
DO $$
BEGIN
    IF (SELECT count(*) FROM metadata.entity_field
         WHERE change_set_id = '10000000-0000-0000-0000-000000000006') <> 5 THEN
        RAISE EXCEPTION 'Tenant application role cannot read its Entity graph';
    END IF;
END;
$$;
RESET ROLE;

SELECT set_config('app.current_tenant_id', '20000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE athyperapp;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM metadata.entity_field
         WHERE change_set_id = '10000000-0000-0000-0000-000000000006'
    ) THEN
        RAISE EXCEPTION 'Cross-tenant Entity graph rows were visible';
    END IF;
END;
$$;
RESET ROLE;

ROLLBACK;

SELECT 'META_ENTITY_PHASE2_SMOKE_OK' AS result;
