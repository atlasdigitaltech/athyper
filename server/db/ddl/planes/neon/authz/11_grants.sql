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
