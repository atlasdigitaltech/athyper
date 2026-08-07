REVOKE ALL ON authz.application_projection,authz.projection_provider,authz.projection_scope FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN GRANT SELECT,INSERT,UPDATE ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyper_projection_applier; GRANT EXECUTE ON FUNCTION authz.fn_activate_application_projection(uuid,uuid,bigint,text,uuid) TO athyper_projection_applier; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyperadmin; END IF; END $$;

REVOKE ALL ON authz.entity_operation_scope_binding FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_normalize_entity_operation_scope_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_validate_entity_operation_scope_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_guard_entity_operation_scope_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_guard_entity_operation_scope_binding_delete() FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON authz.entity_operation_scope_binding TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON authz.entity_operation_scope_binding TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_normalize_entity_operation_scope_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_validate_entity_operation_scope_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_guard_entity_operation_scope_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_guard_entity_operation_scope_binding_delete() TO athyperadmin;
    END IF;
END; $$;
