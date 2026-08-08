-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
REVOKE ALL ON ALL TABLES IN SCHEMA authz FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA authz FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA authz TO athyperapp;
        GRANT SELECT ON
            authz.plane_membership,
            authz.scope_target,
            authz.role,
            authz.role_permission,
            authz.principal_group,
            authz.group_member,
            authz.group_role,
            authz.deny_rule,
            authz.delegation,
            authz.delegation_grant,
            authz.override,
            authz.record_acl,
            authz.trusted_device,
            authz.permission_catalog,
            authz.current_principal_plane_membership,
            authz.current_principal_group_role_grant
        TO athyperapp;
        GRANT INSERT, UPDATE ON authz.trusted_device TO athyperapp;
        GRANT EXECUTE ON FUNCTION authz.fn_permission_is_assignable_at_scope(
            uuid, uuid, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION authz.fn_scope_assignment_covers_target(
            uuid, uuid, uuid, authz.propagation_mode_d
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION authz.fn_revoke_principal_trusted_devices(
            uuid, uuid, uuid, text
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA authz TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA authz TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA authz TO athyperadmin;
    END IF;
END;
$$;

-- Athyper-published and reconciled authorization projections.
REVOKE ALL ON authz.application_projection,authz.projection_provider,authz.projection_scope FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN GRANT SELECT,INSERT,UPDATE ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyper_projection_applier; GRANT EXECUTE ON FUNCTION authz.fn_activate_application_projection(uuid,uuid,bigint,text,uuid) TO athyper_projection_applier; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyperadmin; END IF; END $$;

REVOKE ALL ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT EXECUTE ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT EXECUTE ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON authz.entity_operation_binding,authz.entity_operation_scope_binding FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_normalize_entity_operation_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_validate_entity_operation_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_guard_entity_operation_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_guard_entity_operation_binding_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_normalize_entity_operation_scope_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.trg_guard_entity_operation_scope_binding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.fn_activate_entity_operation_projection(uuid,timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION authz.fn_restore_entity_operation_projection(uuid,timestamptz) FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_normalize_entity_operation_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_validate_entity_operation_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_guard_entity_operation_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_guard_entity_operation_binding_delete() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_normalize_entity_operation_scope_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.trg_guard_entity_operation_scope_binding() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.fn_activate_entity_operation_projection(uuid,timestamptz) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.fn_restore_entity_operation_projection(uuid,timestamptz) TO athyperadmin;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_applier') THEN
        GRANT SELECT ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb) TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_activate_entity_operation_projection(uuid,timestamptz) TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_restore_entity_operation_projection(uuid,timestamptz) TO athyper_projection_applier;
    END IF;
END; $$;
