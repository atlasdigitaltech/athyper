REVOKE ALL ON
    control.rounding_rule,
    control.procurement_match_tolerance_policy,
    control.fx_policy,
    control.dimension_policy,
    control.dimension_policy_allowed_value
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            control.rounding_rule,
            control.procurement_match_tolerance_policy,
            control.fx_policy
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.dimension_policy,
            control.dimension_policy_allowed_value
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.rounding_rule,
            control.procurement_match_tolerance_policy,
            control.fx_policy,
            control.dimension_policy,
            control.dimension_policy_allowed_value
        TO athyperadmin;
    END IF;
END;
$$;
