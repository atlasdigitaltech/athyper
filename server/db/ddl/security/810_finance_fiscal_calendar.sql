-- Runtime grants for the Stage 1 fiscal calendar aggregate.
-- Tenant RLS remains the data-isolation boundary for direct configuration DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    control.fiscal_calendar_config,
    control.fiscal_calendar_period_rule,
    control.company_fiscal_calendar_assignment
TO athyperapp;

DO $$ BEGIN
    ALTER FUNCTION control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean)
        OWNER TO athyperadmin;
    REVOKE EXECUTE ON FUNCTION control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean)
        FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean)
        TO athyperapp;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

GRANT EXECUTE ON FUNCTION control.fiscal_calendar_year_start(uuid, uuid, integer) TO athyperapp;
GRANT EXECUTE ON FUNCTION control.preview_fiscal_calendar(uuid, uuid, integer) TO athyperapp;
GRANT EXECUTE ON FUNCTION control.resolve_company_fiscal_calendar(uuid, uuid, integer) TO athyperapp;
GRANT EXECUTE ON FUNCTION master.resolve_fiscal_period(uuid, uuid, date, boolean) TO athyperapp;

COMMENT ON FUNCTION control.generate_fiscal_periods(uuid, uuid, integer, uuid, uuid, boolean) IS
    'Tenant-session-bound generator. Runs with admin table privileges after verifying p_tenant_id equals app.current_tenant_id.';
