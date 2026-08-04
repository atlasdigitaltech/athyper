CREATE OR REPLACE FUNCTION metadata.fn_jsonb_object_has_only_keys(
    p_document jsonb,
    p_allowed_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT p_document IS NOT NULL
       AND jsonb_typeof(p_document) = 'object'
       AND NOT EXISTS (
            SELECT 1
              FROM jsonb_object_keys(p_document) AS document_key
             WHERE NOT (document_key = ANY (p_allowed_keys))
       );
$$;

CREATE OR REPLACE FUNCTION metadata.fn_advance_entity_change_set(
    p_change_set_id uuid,
    p_expected_lock_version bigint,
    p_actor_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_actor uuid;
    v_new_lock_version bigint;
BEGIN
    v_actor := metadata.current_actor_id(p_actor_id);
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required to edit an Entity graph'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE metadata.entity_change_set
       SET lock_version = lock_version + 1,
           updated_by = v_actor
     WHERE id = p_change_set_id
       AND lock_version = p_expected_lock_version
       AND status IN ('draft', 'rejected')
    RETURNING lock_version INTO v_new_lock_version;

    IF v_new_lock_version IS NULL THEN
        IF EXISTS (
            SELECT 1
              FROM metadata.entity_change_set
             WHERE id = p_change_set_id
               AND status NOT IN ('draft', 'rejected')
        ) THEN
            RAISE EXCEPTION 'Entity change set % is not editable', p_change_set_id
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;

        RAISE EXCEPTION 'Entity change set % has a stale lock version', p_change_set_id
            USING ERRCODE = 'serialization_failure';
    END IF;

    PERFORM set_config(
        'app.entity_change_set_write_token',
        p_change_set_id::text || ':' || v_new_lock_version::text,
        true
    );

    RETURN v_new_lock_version;
END;
$$;

COMMENT ON FUNCTION metadata.fn_advance_entity_change_set(uuid, bigint, uuid) IS
  'Compares and advances a change-set lock exactly once, then issues a transaction-local token required by all normalized graph mutations.';

CREATE OR REPLACE FUNCTION metadata.trg_guard_entity_graph_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_row jsonb;
    v_old jsonb;
    v_change_set_id uuid;
    v_tenant_id uuid;
    v_entity_id uuid;
    v_parent metadata.entity_change_set%ROWTYPE;
    v_token text;
    v_index integer;
    v_key_column text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := to_jsonb(OLD);
    ELSE
        v_row := to_jsonb(NEW);
    END IF;

    v_change_set_id := (v_row ->> 'change_set_id')::uuid;
    v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
    v_entity_id := (v_row ->> 'entity_id')::uuid;

    SELECT * INTO v_parent
      FROM metadata.entity_change_set
     WHERE id = v_change_set_id;

    IF NOT FOUND
       OR v_parent.tenant_id IS DISTINCT FROM v_tenant_id
       OR v_parent.entity_id <> v_entity_id THEN
        RAISE EXCEPTION 'Entity graph row scope does not match its change set'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Only draft or rejected Entity change sets may be edited'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    v_token := current_setting('app.entity_change_set_write_token', true);
    IF nullif(v_token, '') IS NULL
       OR split_part(v_token, ':', 1) <> v_change_set_id::text
       OR split_part(v_token, ':', 2) <> v_parent.lock_version::text THEN
        RAISE EXCEPTION 'Advance the expected Entity change-set lock before mutating its graph'
            USING ERRCODE = 'serialization_failure';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        IF ROW(v_row -> 'id', v_row -> 'tenant_id', v_row -> 'entity_id',
               v_row -> 'change_set_id', v_row -> 'created_at', v_row -> 'created_by')
           IS DISTINCT FROM
           ROW(v_old -> 'id', v_old -> 'tenant_id', v_old -> 'entity_id',
               v_old -> 'change_set_id', v_old -> 'created_at', v_old -> 'created_by') THEN
            RAISE EXCEPTION 'Entity graph identity, scope, and creation evidence are immutable'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;

        IF TG_NARGS > 0 THEN
            FOR v_index IN 0..TG_NARGS - 1 LOOP
                v_key_column := TG_ARGV[v_index];
                IF v_row -> v_key_column IS DISTINCT FROM v_old -> v_key_column THEN
                    RAISE EXCEPTION 'Entity graph logical coordinate % is immutable', v_key_column
                        USING ERRCODE = 'integrity_constraint_violation';
                END IF;
            END LOOP;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_graph_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_row jsonb;
    v_tenant_id uuid;
    v_entity_id uuid;
    v_change_set_id uuid;
    v_parent_tenant uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    v_row := to_jsonb(NEW);
    v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
    v_entity_id := (v_row ->> 'entity_id')::uuid;
    v_change_set_id := (v_row ->> 'change_set_id')::uuid;

    IF TG_TABLE_NAME = 'entity_key_field' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_key AS entity_key
              JOIN metadata.entity_field AS entity_field
                ON entity_field.id = NEW.entity_field_id
             WHERE entity_key.id = NEW.entity_key_id
               AND entity_key.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_field.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_key.entity_id = v_entity_id
               AND entity_field.entity_id = v_entity_id
               AND entity_key.change_set_id = v_change_set_id
               AND entity_field.change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Key-field binding members must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_search_field' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_search_profile AS search_profile
              JOIN metadata.entity_field AS entity_field
                ON entity_field.id = NEW.entity_field_id
             WHERE search_profile.id = NEW.entity_search_profile_id
               AND search_profile.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_field.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND search_profile.entity_id = v_entity_id
               AND entity_field.entity_id = v_entity_id
               AND search_profile.change_set_id = v_change_set_id
               AND entity_field.change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Search-field binding members must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_relation_target' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_relation
             WHERE id = NEW.entity_relation_id
               AND tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_id = v_entity_id
               AND change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Relation target must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        SELECT tenant_id INTO v_parent_tenant
          FROM metadata.entity
         WHERE id = NEW.target_entity_id;
        IF NOT FOUND
           OR (v_tenant_id IS NULL AND v_parent_tenant IS NOT NULL)
           OR (v_tenant_id IS NOT NULL
               AND v_parent_tenant IS NOT NULL
               AND v_parent_tenant <> v_tenant_id) THEN
            RAISE EXCEPTION 'Relation target Entity is not visible in the source Entity scope'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'entity_relation_field' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM metadata.entity_relation_target AS relation_target
              JOIN metadata.entity_field AS entity_field
                ON entity_field.id = NEW.source_field_id
             WHERE relation_target.id = NEW.entity_relation_target_id
               AND relation_target.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND entity_field.tenant_id IS NOT DISTINCT FROM v_tenant_id
               AND relation_target.entity_id = v_entity_id
               AND entity_field.entity_id = v_entity_id
               AND relation_target.change_set_id = v_change_set_id
               AND entity_field.change_set_id = v_change_set_id
        ) THEN
            RAISE EXCEPTION 'Relation field mapping must belong to the same scoped Entity graph'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_field_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_allowed text[];
    v_rule jsonb;
    v_parameters jsonb;
    v_rule_kind text;
BEGIN
    v_allowed := CASE NEW.data_type::text
        WHEN 'string' THEN ARRAY['kind', 'min_length', 'max_length', 'pattern']
        WHEN 'text' THEN ARRAY['kind', 'min_length', 'max_length', 'pattern']
        WHEN 'integer' THEN ARRAY['kind', 'minimum', 'maximum']
        WHEN 'bigint' THEN ARRAY['kind', 'minimum', 'maximum']
        WHEN 'decimal' THEN ARRAY['kind', 'minimum', 'maximum', 'precision', 'scale']
        WHEN 'boolean' THEN ARRAY['kind']
        WHEN 'uuid' THEN ARRAY['kind']
        WHEN 'date' THEN ARRAY['kind']
        WHEN 'datetime' THEN ARRAY['kind', 'timezone_mode']
        WHEN 'json' THEN ARRAY['kind', 'schema_code']
        WHEN 'enum' THEN ARRAY['kind', 'domain_code']
        WHEN 'reference' THEN ARRAY['kind', 'identifier_type']
        WHEN 'money' THEN ARRAY['kind', 'currency_mode', 'currency_field_key', 'fixed_currency_code', 'scale']
    END;

    IF NOT metadata.fn_jsonb_object_has_only_keys(NEW.type_config, v_allowed) THEN
        RAISE EXCEPTION 'type_config contains properties not allowed for data type %', NEW.data_type
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.data_type = 'enum'
       AND coalesce(NEW.type_config ->> 'domain_code', '') !~ '^[a-z][a-z0-9_.-]{1,126}$' THEN
        RAISE EXCEPTION 'enum type_config requires a canonical domain_code'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.data_type = 'reference'
       AND coalesce(NEW.type_config ->> 'identifier_type', '') NOT IN ('uuid', 'string', 'integer', 'bigint') THEN
        RAISE EXCEPTION 'reference type_config requires a supported identifier_type'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NEW.default_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.default_spec,
            ARRAY['kind', 'value', 'field_key', 'context_key', 'resolver_key', 'apply_on']
        ) OR coalesce(NEW.default_spec ->> 'kind', '') NOT IN (
            'static', 'current_time', 'current_date', 'principal',
            'tenant_context', 'parent_field', 'resolver'
        ) THEN
            RAISE EXCEPTION 'default_spec is not a supported strict default contract'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF NEW.default_spec ? 'apply_on'
           AND (jsonb_typeof(NEW.default_spec -> 'apply_on') <> 'array'
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(NEW.default_spec -> 'apply_on') AS apply_event
                     WHERE apply_event NOT IN ('create', 'reset')
                )) THEN
            RAISE EXCEPTION 'default_spec.apply_on may contain only create or reset'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    END IF;

    IF NEW.computation_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.computation_spec,
            ARRAY['kind', 'language', 'expression', 'handler_key']
        ) OR coalesce(NEW.computation_spec ->> 'kind', '') NOT IN ('expression', 'handler') THEN
            RAISE EXCEPTION 'computation_spec is not a supported strict computation contract'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF (NEW.computation_spec ->> 'kind' = 'expression'
                AND (coalesce(NEW.computation_spec ->> 'language', '') NOT IN ('cel', 'jsonlogic')
                    OR nullif(btrim(NEW.computation_spec ->> 'expression'), '') IS NULL
                    OR NEW.computation_spec ? 'handler_key'))
           OR (NEW.computation_spec ->> 'kind' = 'handler'
                AND (coalesce(NEW.computation_spec ->> 'handler_key', '') !~ '^[a-z][a-z0-9_.:-]{1,126}$'
                    OR NEW.computation_spec ? 'expression'
                    OR NEW.computation_spec ? 'language')) THEN
            RAISE EXCEPTION 'computation_spec kind and properties are inconsistent'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;
    END IF;

    IF NEW.validation_spec IS NOT NULL THEN
        IF NOT metadata.fn_jsonb_object_has_only_keys(
            NEW.validation_spec,
            ARRAY['schema_version', 'rules']
        ) OR coalesce((NEW.validation_spec ->> 'schema_version')::integer, 0) <> 1
          OR jsonb_typeof(NEW.validation_spec -> 'rules') <> 'array' THEN
            RAISE EXCEPTION 'validation_spec must be a version 1 strict rule collection'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        FOR v_rule IN SELECT value FROM jsonb_array_elements(NEW.validation_spec -> 'rules') LOOP
            IF NOT metadata.fn_jsonb_object_has_only_keys(
                v_rule,
                ARRAY['code', 'kind', 'parameters', 'message_key', 'severity']
            ) THEN
                RAISE EXCEPTION 'validation_spec contains an unsupported rule property'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_rule_kind := v_rule ->> 'kind';
            v_parameters := coalesce(v_rule -> 'parameters', '{}'::jsonb);
            IF coalesce(v_rule ->> 'code', '') !~ '^[a-z][a-z0-9_.-]{1,126}$'
               OR v_rule_kind NOT IN ('length', 'range', 'pattern', 'allowed_values', 'comparison', 'custom_handler')
               OR jsonb_typeof(v_parameters) <> 'object'
               OR coalesce(v_rule ->> 'severity', 'error') NOT IN ('error', 'warning') THEN
                RAISE EXCEPTION 'validation_spec contains an invalid rule contract'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_allowed := CASE v_rule_kind
                WHEN 'length' THEN ARRAY['minimum', 'maximum']
                WHEN 'range' THEN ARRAY['minimum', 'maximum', 'inclusive_minimum', 'inclusive_maximum']
                WHEN 'pattern' THEN ARRAY['pattern', 'flags']
                WHEN 'allowed_values' THEN ARRAY['values']
                WHEN 'comparison' THEN ARRAY['field_key', 'operator']
                WHEN 'custom_handler' THEN ARRAY['handler_key']
            END;
            IF NOT metadata.fn_jsonb_object_has_only_keys(v_parameters, v_allowed) THEN
                RAISE EXCEPTION 'validation rule % contains unsupported parameters', v_rule ->> 'code'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Field specification contains a value with an invalid scalar type'
            USING ERRCODE = 'invalid_parameter_value';
END;
$$;

CREATE OR REPLACE FUNCTION metadata.fn_validate_entity_graph(
    p_change_set_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
DECLARE
    v_profile metadata.entity_runtime_profile%ROWTYPE;
    v_graph_count integer;
    v_problem_path text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM metadata.entity_change_set WHERE id = p_change_set_id) THEN
        RETURN;
    END IF;

    SELECT (
        (SELECT count(*) FROM metadata.entity_runtime_profile WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_field WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_key WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_search_profile WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_relation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_surface WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_operation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_surface_operation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_operation_rule WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_flow WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_policy_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_field_policy_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_contract_test_case WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_lifecycle_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_lifecycle_operation_binding WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_numbering_binding WHERE change_set_id = p_change_set_id)
    ) INTO v_graph_count;

    IF v_graph_count = 0 THEN
        RETURN;
    END IF;

    SELECT * INTO v_profile
      FROM metadata.entity_runtime_profile
     WHERE change_set_id = p_change_set_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ENTITY_RUNTIME_PROFILE_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'runtime_profile.default';
    END IF;

    IF v_profile.record_version_field_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_field
             WHERE change_set_id = p_change_set_id
               AND field_key = v_profile.record_version_field_key
               AND data_type IN ('integer', 'bigint')
               AND cardinality = 'one'
               AND value_origin = 'stored'
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'ENTITY_RECORD_VERSION_FIELD_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'runtime_profile.record_version_field_key';
    END IF;

    IF v_profile.tenant_field_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_field
             WHERE change_set_id = p_change_set_id
               AND field_key = v_profile.tenant_field_key
               AND data_type = 'uuid'
               AND cardinality = 'one'
               AND value_origin = 'stored'
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'ENTITY_TENANT_FIELD_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'runtime_profile.tenant_field_key';
    END IF;

    SELECT lifecycle.binding_key INTO v_problem_path
      FROM metadata.entity_lifecycle_binding AS lifecycle
     WHERE lifecycle.change_set_id = p_change_set_id
       AND lifecycle.status = 'active'
       AND lifecycle.required
       AND NOT EXISTS (
            SELECT 1
              FROM metadata.entity_lifecycle_operation_binding AS operation_binding
             WHERE operation_binding.entity_lifecycle_binding_id = lifecycle.id
               AND operation_binding.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_LIFECYCLE_OPERATION_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'lifecycle.' || v_problem_path;
    END IF;

    SELECT entity_key.key_key INTO v_problem_path
      FROM metadata.entity_key AS entity_key
     WHERE entity_key.change_set_id = p_change_set_id
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_key_field
             WHERE entity_key_id = entity_key.id
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_KEY_FIELDS_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'keys.' || v_problem_path;
    END IF;

    IF v_profile.backing_kind IN ('table', 'view', 'materialized_view')
       AND v_profile.api_exposure = 'api'
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_key
             WHERE change_set_id = p_change_set_id
               AND key_kind = 'primary'
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'ENTITY_PRIMARY_KEY_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'keys';
    END IF;

    SELECT entity_key.key_key INTO v_problem_path
      FROM metadata.entity_key AS entity_key
      JOIN metadata.entity_key_field AS key_field ON key_field.entity_key_id = entity_key.id
      JOIN metadata.entity_field AS entity_field ON entity_field.id = key_field.entity_field_id
     WHERE entity_key.change_set_id = p_change_set_id
       AND entity_key.key_kind = 'primary'
       AND entity_key.status = 'active'
       AND (entity_field.cardinality <> 'one'
            OR entity_field.value_origin <> 'stored'
            OR entity_field.write_mode = 'computed'
            OR entity_field.status <> 'active')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_PRIMARY_KEY_FIELD_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'keys.' || v_problem_path;
    END IF;

    SELECT search_profile.search_key INTO v_problem_path
      FROM metadata.entity_search_profile AS search_profile
     WHERE search_profile.change_set_id = p_change_set_id
       AND search_profile.status = 'active'
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_search_field
             WHERE entity_search_profile_id = search_profile.id
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SEARCH_FIELDS_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'search.' || v_problem_path;
    END IF;

    SELECT search_profile.search_key INTO v_problem_path
      FROM metadata.entity_search_field AS search_field
      JOIN metadata.entity_search_profile AS search_profile
        ON search_profile.id = search_field.entity_search_profile_id
      JOIN metadata.entity_field AS entity_field ON entity_field.id = search_field.entity_field_id
     WHERE search_profile.change_set_id = p_change_set_id
       AND ((search_field.match_mode IN ('prefix', 'contains', 'full_text')
                AND entity_field.data_type NOT IN ('string', 'text'))
            OR entity_field.cardinality = 'many'
            OR entity_field.status <> 'active')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SEARCH_FIELD_MATCH_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'search.' || v_problem_path;
    END IF;

    SELECT relation.relation_key INTO v_problem_path
      FROM metadata.entity_relation AS relation
     WHERE relation.change_set_id = p_change_set_id
       AND (
            (relation.resolution_kind <> 'polymorphic' AND
                (SELECT count(*) FROM metadata.entity_relation_target
                  WHERE entity_relation_id = relation.id) <> 1)
            OR (relation.resolution_kind = 'polymorphic' AND
                (SELECT count(*) FROM metadata.entity_relation_target
                  WHERE entity_relation_id = relation.id) < 2)
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_RELATION_TARGET_COUNT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'relations.' || v_problem_path;
    END IF;

    SELECT relation.relation_key INTO v_problem_path
      FROM metadata.entity_relation AS relation
      JOIN metadata.entity_relation_target AS relation_target
        ON relation_target.entity_relation_id = relation.id
     WHERE relation.change_set_id = p_change_set_id
       AND ((relation.resolution_kind <> 'polymorphic'
                AND (relation_target.discriminator_value IS NOT NULL OR NOT relation_target.is_default))
            OR (relation.resolution_kind = 'polymorphic'
                AND NOT relation_target.is_default
                AND relation_target.discriminator_value IS NULL))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_RELATION_DISCRIMINATOR_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'relations.' || v_problem_path;
    END IF;

    SELECT relation.relation_key INTO v_problem_path
      FROM metadata.entity_relation AS relation
      JOIN metadata.entity_relation_target AS relation_target
        ON relation_target.entity_relation_id = relation.id
     WHERE relation.change_set_id = p_change_set_id
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_relation_field
             WHERE entity_relation_target_id = relation_target.id
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_RELATION_FIELD_MAPPING_REQUIRED'
            USING ERRCODE = 'check_violation', DETAIL = 'relations.' || v_problem_path;
    END IF;

    SELECT entity_field.field_key INTO v_problem_path
      FROM metadata.entity_field AS entity_field
     WHERE entity_field.change_set_id = p_change_set_id
       AND entity_field.replacement_field_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_field AS replacement
             WHERE replacement.change_set_id = p_change_set_id
               AND replacement.field_key = entity_field.replacement_field_key
               AND replacement.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_FIELD_REPLACEMENT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'fields.' || v_problem_path;
    END IF;

    SELECT binding.binding_key INTO v_problem_path
      FROM metadata.entity_surface_field_binding AS binding
      JOIN metadata.entity_field AS entity_field ON entity_field.id = binding.entity_field_id
     WHERE binding.change_set_id = p_change_set_id
       AND binding.status = 'active'
       AND entity_field.status <> 'active'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SURFACE_FIELD_INACTIVE'
            USING ERRCODE = 'check_violation', DETAIL = 'surfaces.' || v_problem_path;
    END IF;

    SELECT surface_row.surface_key INTO v_problem_path
      FROM metadata.entity_surface AS surface_row
     WHERE surface_row.change_set_id = p_change_set_id
       AND surface_row.replacement_surface_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_surface AS replacement
             WHERE replacement.change_set_id = p_change_set_id
               AND replacement.surface_key = surface_row.replacement_surface_key
               AND replacement.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SURFACE_REPLACEMENT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'surfaces.' || v_problem_path;
    END IF;

    SELECT operation_row.operation_key INTO v_problem_path
      FROM metadata.entity_operation AS operation_row
     WHERE operation_row.change_set_id = p_change_set_id
       AND operation_row.replacement_operation_key IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM metadata.entity_operation AS replacement
             WHERE replacement.change_set_id = p_change_set_id
               AND replacement.operation_key = operation_row.replacement_operation_key
               AND replacement.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_OPERATION_REPLACEMENT_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'operations.' || v_problem_path;
    END IF;

    SELECT flow_row.flow_key INTO v_problem_path
      FROM metadata.entity_flow AS flow_row
     WHERE flow_row.change_set_id = p_change_set_id
       AND (NOT EXISTS (SELECT 1 FROM metadata.entity_flow_step WHERE entity_flow_id = flow_row.id)
            OR (flow_row.replacement_flow_key IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM metadata.entity_flow replacement
                 WHERE replacement.change_set_id = p_change_set_id
                   AND replacement.flow_key = flow_row.replacement_flow_key
                   AND replacement.status = 'active')))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_FLOW_INVALID'
            USING ERRCODE = 'check_violation', DETAIL = 'flows.' || v_problem_path;
    END IF;

    SELECT placement.placement_key INTO v_problem_path
      FROM metadata.entity_surface_operation placement
      JOIN metadata.entity_surface surface_row ON surface_row.id = placement.entity_surface_id
      JOIN metadata.entity_operation operation_row ON operation_row.id = placement.entity_operation_id
     WHERE placement.change_set_id = p_change_set_id
       AND placement.status = 'active'
       AND (surface_row.status <> 'active' OR operation_row.status <> 'active')
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_SURFACE_OPERATION_INACTIVE_MEMBER'
            USING ERRCODE = 'check_violation', DETAIL = 'surface_operations.' || v_problem_path;
    END IF;

    SELECT binding.binding_key INTO v_problem_path
      FROM metadata.entity_policy_binding binding
      JOIN control.policy_definition policy ON policy.id = binding.policy_definition_id
     WHERE binding.change_set_id = p_change_set_id
       AND binding.status = 'active'
       AND policy.status <> 'active'
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_POLICY_BINDING_INACTIVE'
            USING ERRCODE = 'check_violation', DETAIL = 'policy_bindings.' || v_problem_path;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_graph_deferred()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM metadata.fn_validate_entity_graph(OLD.change_set_id);
        RETURN OLD;
    END IF;
    PERFORM metadata.fn_validate_entity_graph(NEW.change_set_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION metadata.trg_reject_entity_class_profile_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'metadata.entity_class_profile is immutable; install a new seed contract instead'
        USING ERRCODE = 'check_violation';
END;
$$;
