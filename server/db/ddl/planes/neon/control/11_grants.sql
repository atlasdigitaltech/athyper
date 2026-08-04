REVOKE ALL ON SCHEMA control FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA control FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA control FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT ON
            control.subscription_plan,
            control.owner_type,
            control.owner_type_purpose,
            control.org_unit_type
        TO athyperapp;
        GRANT INSERT, UPDATE ON control.org_unit_type TO athyperapp;

        GRANT EXECUTE ON FUNCTION control.fn_register_owner_type(
            uuid, text, text, text, text, text, text, text, text,
            boolean, boolean, boolean
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_activate_owner_type(
            uuid, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_deprecate_owner_type(
            uuid, uuid
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_add_owner_type_purpose(
            uuid, uuid, text, text
        ) TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_remove_owner_type_purpose(
            uuid, uuid, text, text
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA control TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA control TO athyperadmin;
    END IF;
END;
$$;
