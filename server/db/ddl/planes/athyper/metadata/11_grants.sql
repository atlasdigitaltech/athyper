REVOKE ALL ON SCHEMA metadata FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA metadata FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA metadata FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA metadata TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            metadata.entity,
            metadata.entity_change_set
        TO athyperapp;
        GRANT SELECT, INSERT ON metadata.entity_release TO athyperapp;
        GRANT SELECT ON metadata.entity_publication_status TO athyperapp;
        GRANT EXECUTE ON FUNCTION metadata.current_actor_id(uuid) TO athyperapp;
        GRANT EXECUTE ON FUNCTION metadata.fn_compute_entity_release_hash(
            uuid, uuid, uuid, uuid, bigint, text,
            metadata.entity_release_kind_d, uuid, uuid, text, text, text, text,
            metadata.compatibility_level_d, text[], text, text, text, uuid,
            timestamptz, uuid
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA metadata TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA metadata TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA metadata TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    metadata.entity_class_profile,
    metadata.entity_runtime_profile,
    metadata.entity_field,
    metadata.entity_key,
    metadata.entity_key_field,
    metadata.entity_search_profile,
    metadata.entity_search_field,
    metadata.entity_relation,
    metadata.entity_relation_target,
    metadata.entity_relation_field
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION metadata.fn_jsonb_object_has_only_keys(jsonb, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.fn_advance_entity_change_set(uuid, bigint, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.fn_validate_entity_graph(uuid) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON metadata.entity_class_profile TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            metadata.entity_runtime_profile,
            metadata.entity_field,
            metadata.entity_key,
            metadata.entity_key_field,
            metadata.entity_search_profile,
            metadata.entity_search_field,
            metadata.entity_relation,
            metadata.entity_relation_target,
            metadata.entity_relation_field
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            metadata.fn_advance_entity_change_set(uuid, bigint, uuid)
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            metadata.fn_jsonb_object_has_only_keys(jsonb, text[])
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION metadata.fn_validate_entity_graph(uuid)
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            metadata.entity_class_profile,
            metadata.entity_runtime_profile,
            metadata.entity_field,
            metadata.entity_key,
            metadata.entity_key_field,
            metadata.entity_search_profile,
            metadata.entity_search_field,
            metadata.entity_relation,
            metadata.entity_relation_target,
            metadata.entity_relation_field
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            metadata.fn_jsonb_object_has_only_keys(jsonb, text[]),
            metadata.fn_advance_entity_change_set(uuid, bigint, uuid),
            metadata.fn_validate_entity_graph(uuid)
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON metadata.entity_surface, metadata.entity_surface_section,
    metadata.entity_surface_field_binding, metadata.entity_operation,
    metadata.entity_operation_permission FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.trg_validate_entity_surface_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.trg_validate_entity_operation_references() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_surface,
            metadata.entity_surface_section, metadata.entity_surface_field_binding,
            metadata.entity_operation, metadata.entity_operation_permission TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON metadata.entity_surface, metadata.entity_surface_section,
            metadata.entity_surface_field_binding, metadata.entity_operation,
            metadata.entity_operation_permission TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON metadata.entity_surface_operation, metadata.entity_operation_rule,
    metadata.entity_flow, metadata.entity_flow_step, metadata.entity_policy_binding,
    metadata.entity_field_policy_binding, metadata.entity_contract_test_case FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_surface_operation, metadata.entity_operation_rule,
    metadata.entity_flow, metadata.entity_flow_step, metadata.entity_policy_binding,
    metadata.entity_field_policy_binding, metadata.entity_contract_test_case TO athyperapp;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_surface_operation, metadata.entity_operation_rule,
            metadata.entity_flow, metadata.entity_flow_step, metadata.entity_policy_binding,
            metadata.entity_field_policy_binding, metadata.entity_contract_test_case TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON metadata.entity_lifecycle_binding,metadata.entity_lifecycle_operation_binding FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.entity_lifecycle_binding,metadata.entity_lifecycle_operation_binding TO athyperapp;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.entity_lifecycle_binding,metadata.entity_lifecycle_operation_binding TO athyperadmin;
END IF; END $$;

REVOKE ALL ON metadata.entity_numbering_binding FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.entity_numbering_binding TO athyperapp;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON metadata.entity_numbering_binding TO athyperadmin;
  END IF;
END $$;

REVOKE ALL ON metadata.entity_operation_scope_binding FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION metadata.trg_validate_entity_operation_scope_binding() FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON metadata.entity_operation_scope_binding TO athyperapp;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON metadata.entity_operation_scope_binding TO athyperadmin;
        GRANT EXECUTE ON FUNCTION metadata.trg_validate_entity_operation_scope_binding()
            TO athyperadmin;
    END IF;
END
$$;
