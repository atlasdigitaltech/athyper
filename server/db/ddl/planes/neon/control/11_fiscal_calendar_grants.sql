REVOKE ALL ON
    control.fiscal_calendar_config,
    control.fiscal_calendar_period_rule,
    control.company_fiscal_calendar_assignment
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    control.fiscal_calendar_year_start(uuid, uuid, integer),
    control.preview_fiscal_calendar(uuid, uuid, integer),
    control.resolve_company_fiscal_calendar(uuid, uuid, integer),
    control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean),
    master.resolve_fiscal_period(uuid, uuid, date, boolean)
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.fiscal_calendar_config,
            control.fiscal_calendar_period_rule,
            control.company_fiscal_calendar_assignment
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION
            control.fiscal_calendar_year_start(uuid, uuid, integer),
            control.preview_fiscal_calendar(uuid, uuid, integer),
            control.resolve_company_fiscal_calendar(uuid, uuid, integer),
            control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean),
            master.resolve_fiscal_period(uuid, uuid, date, boolean)
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.fiscal_calendar_config,
            control.fiscal_calendar_period_rule,
            control.company_fiscal_calendar_assignment
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION
            control.fiscal_calendar_year_start(uuid, uuid, integer),
            control.preview_fiscal_calendar(uuid, uuid, integer),
            control.resolve_company_fiscal_calendar(uuid, uuid, integer),
            control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean),
            master.resolve_fiscal_period(uuid, uuid, date, boolean)
        TO athyperadmin;
    END IF;
END;
$$;
