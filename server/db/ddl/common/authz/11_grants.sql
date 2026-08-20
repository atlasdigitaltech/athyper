-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
REVOKE ALL ON ALL TABLES IN SCHEMA authz FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA authz FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA authz TO athyperapp;
        GRANT SELECT ON
            authz.permission,
            authz.permission_scope_kind,
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

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_owner') THEN
    GRANT SELECT ON master.tenant TO athyper_projection_owner;
  END IF;
END $$;

-- Athyper-published and reconciled authorization projections.
REVOKE ALL ON authz.application_projection,authz.projection_provider,authz.projection_scope FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON authz.application_projection,authz.projection_provider,authz.projection_scope FROM athyperadmin,athyper_projection_applier;
REVOKE EXECUTE ON FUNCTION authz.fn_stage_application_projection(uuid,jsonb,jsonb,jsonb,uuid),authz.fn_activate_application_projection(uuid,uuid,bigint,text,uuid) FROM PUBLIC,athyperadmin;
GRANT USAGE ON SCHEMA authz TO athyper_projection_owner,athyper_projection_breakglass;
GRANT SELECT,INSERT,UPDATE,DELETE ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyper_projection_owner,athyper_projection_breakglass;
GRANT USAGE ON SCHEMA master TO athyper_projection_owner;
GRANT SELECT ON master.tenant,authz.scope_target TO athyper_projection_owner;
GRANT USAGE ON SCHEMA shared TO athyper_projection_owner;
GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyper_projection_owner;
GRANT SELECT ON authz.permission,authz.scope_target TO athyper_projection_owner;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_applier') THEN GRANT USAGE ON SCHEMA authz TO athyper_projection_applier; GRANT SELECT ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyper_projection_applier; GRANT EXECUTE ON FUNCTION authz.fn_stage_application_projection(uuid,jsonb,jsonb,jsonb,uuid),authz.fn_activate_application_projection(uuid,uuid,bigint,text,uuid) TO athyper_projection_applier; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT ON authz.application_projection,authz.projection_provider,authz.projection_scope TO athyperadmin; END IF; END $$;

REVOKE ALL ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION authz.fn_reconcile_expired_authority(uuid,timestamptz,uuid) FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT EXECUTE ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) TO athyperapp;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT EXECUTE ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION authz.fn_reconcile_expired_authority(uuid,timestamptz,uuid) TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON authz.entity_operation_binding,authz.entity_operation_scope_binding FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON authz.entity_operation_binding,authz.entity_operation_scope_binding FROM athyperadmin,athyper_projection_applier;
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
REVOKE EXECUTE ON FUNCTION authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb),authz.fn_activate_entity_operation_projection(uuid,timestamptz),authz.fn_retire_entity_operation_projection(uuid,timestamptz),authz.fn_restore_entity_operation_projection(uuid,timestamptz) FROM athyperadmin;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT SELECT ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyperadmin;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_applier') THEN
        GRANT SELECT ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb) TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_activate_entity_operation_projection(uuid,timestamptz) TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) TO athyper_projection_applier;
        GRANT EXECUTE ON FUNCTION authz.fn_restore_entity_operation_projection(uuid,timestamptz) TO athyper_projection_applier;
    END IF;
END; $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON authz.entity_operation_binding,authz.entity_operation_scope_binding TO athyper_projection_owner,athyper_projection_breakglass;
GRANT EXECUTE ON FUNCTION authz.fn_stage_application_projection(uuid,jsonb,jsonb,jsonb,uuid),authz.fn_activate_application_projection(uuid,uuid,bigint,text,uuid),authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb),authz.fn_activate_entity_operation_projection(uuid,timestamptz),authz.fn_retire_entity_operation_projection(uuid,timestamptz),authz.fn_restore_entity_operation_projection(uuid,timestamptz) TO athyper_projection_breakglass;

-- Transfer SECURITY DEFINER ownership only after ACLs are complete. Temporary
-- DDL-role membership is removed immediately; neither admin nor runtime roles
-- inherit the projection owner.
GRANT athyper_projection_owner TO CURRENT_USER;
GRANT CREATE ON SCHEMA authz TO athyper_projection_owner;
ALTER FUNCTION authz.fn_stage_application_projection(uuid,jsonb,jsonb,jsonb,uuid) OWNER TO athyper_projection_owner;
ALTER FUNCTION authz.fn_activate_application_projection(uuid,uuid,bigint,text,uuid) OWNER TO athyper_projection_owner;
ALTER FUNCTION authz.fn_stage_entity_operation_projection(uuid,uuid,text,uuid,text,jsonb) OWNER TO athyper_projection_owner;
ALTER FUNCTION authz.fn_activate_entity_operation_projection(uuid,timestamptz) OWNER TO athyper_projection_owner;
ALTER FUNCTION authz.fn_retire_entity_operation_projection(uuid,timestamptz) OWNER TO athyper_projection_owner;
ALTER FUNCTION authz.fn_restore_entity_operation_projection(uuid,timestamptz) OWNER TO athyper_projection_owner;
REVOKE CREATE ON SCHEMA authz FROM athyper_projection_owner;
REVOKE athyper_projection_owner FROM CURRENT_USER;
