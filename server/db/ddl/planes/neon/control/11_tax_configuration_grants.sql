REVOKE ALL ON
    control.tax_rate_schedule,
    control.tax_group,
    control.tax_group_component,
    control.tax_resolution_rule,
    control.wht_threshold_config
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    control.trg_guard_tax_policy_row(),
    control.trg_validate_tax_rate_schedule(),
    control.trg_validate_tax_group(),
    control.trg_validate_tax_group_component(),
    control.trg_validate_tax_resolution_rule(),
    control.trg_validate_wht_threshold_config()
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.tax_rate_schedule,
            control.tax_group,
            control.tax_group_component,
            control.tax_resolution_rule,
            control.wht_threshold_config
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.tax_rate_schedule,
            control.tax_group,
            control.tax_group_component,
            control.tax_resolution_rule,
            control.wht_threshold_config
        TO athyperadmin;
    END IF;
END;
$$;
