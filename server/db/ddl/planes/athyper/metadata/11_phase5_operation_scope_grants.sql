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
