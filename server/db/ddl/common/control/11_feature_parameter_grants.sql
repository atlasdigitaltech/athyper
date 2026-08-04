REVOKE ALL ON
    control.feature_flag_catalog,
    control.feature_flag_override,
    control.parameter_definition,
    control.tenant_parameter_value
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON
            control.feature_flag_catalog,
            control.feature_flag_override,
            control.parameter_definition
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON control.tenant_parameter_value TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.feature_flag_catalog,
            control.feature_flag_override,
            control.parameter_definition,
            control.tenant_parameter_value
        TO athyperadmin;
    END IF;
END;
$$;
