-- Explicit upgrade from pre-CA DEV baseline; never replay canonical foundation DDL.
-- Rehearse against a restored backup before application. A repeat/partial baseline fails atomically.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('bp-integration-20260921',0));
DO $$ BEGIN IF current_database() <> 'athyper_studio' THEN RAISE EXCEPTION 'Wrong plane database'; END IF; END $$;
CREATE TABLE metadata.entity_capability (
 id uuid NOT NULL DEFAULT shared.uuidv7() PRIMARY KEY,
 tenant_id uuid, entity_id uuid NOT NULL, change_set_id uuid NOT NULL,
 capability_key text NOT NULL CHECK(capability_key IN ('comments','attachments')),
 declaration jsonb NOT NULL CHECK(jsonb_typeof(declaration)='object'),
 binding jsonb CHECK(binding IS NULL OR jsonb_typeof(binding)='object'),
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 updated_at timestamptz, updated_by uuid,
 UNIQUE NULLS NOT DISTINCT(tenant_id,id),
 UNIQUE NULLS NOT DISTINCT(tenant_id,change_set_id,capability_key),
 CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

ALTER TABLE metadata.entity_capability
 ADD CONSTRAINT entity_capability_entity_fk FOREIGN KEY(entity_id) REFERENCES metadata.entity(id),
 ADD CONSTRAINT entity_capability_changeset_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id),
 ADD CONSTRAINT entity_capability_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id),
 ADD CONSTRAINT entity_capability_actor_fk FOREIGN KEY(created_by) REFERENCES master.principal(id);

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['entity_capability'] LOOP
        EXECUTE format('ALTER TABLE metadata.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE metadata.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_read ON metadata.%I FOR SELECT TO athyperapp USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_insert ON metadata.%I FOR INSERT TO athyperapp WITH CHECK (tenant_id = shared.current_tenant_id() AND created_by = master.current_principal_id_soft())', v_table);
        EXECUTE format('CREATE POLICY tenant_update ON metadata.%I FOR UPDATE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY tenant_delete ON metadata.%I FOR DELETE TO athyperapp USING (tenant_id = shared.current_tenant_id_soft())', v_table);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
            EXECUTE format('CREATE POLICY admin_access ON metadata.%I FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', v_table);
        END IF;
    END LOOP;
END;
$$;
REVOKE ALL ON metadata.entity_capability FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_capability TO athyperapp;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_capability TO athyperadmin; END IF; END $$;

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
        + (SELECT count(*) FROM metadata.entity_operation_permission WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_surface_operation WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_operation_rule WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_flow WHERE change_set_id = p_change_set_id)
        + (SELECT count(*) FROM metadata.entity_capability WHERE change_set_id = p_change_set_id)
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

    SELECT operation_row.operation_key INTO v_problem_path
      FROM metadata.entity_operation AS operation_row
     WHERE operation_row.change_set_id = p_change_set_id
       AND operation_row.status = 'active'
       AND operation_row.permission_code IS NULL
       AND NOT EXISTS (
            SELECT 1
              FROM metadata.entity_operation_permission AS permission_binding
             WHERE permission_binding.entity_operation_id = operation_row.id
               AND permission_binding.status = 'active'
       )
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'ENTITY_OPERATION_PERMISSION_REQUIRED'
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

CREATE TRIGGER entity_capability_graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_capability
 FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('capability_key');
CREATE TRIGGER entity_capability_updated_at BEFORE UPDATE ON metadata.entity_capability
 FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE CONSTRAINT TRIGGER entity_capability_graph_validate
 AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_capability
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION metadata.trg_validate_entity_graph_deferred();
COMMIT;
