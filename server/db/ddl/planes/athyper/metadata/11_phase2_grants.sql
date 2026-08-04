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
