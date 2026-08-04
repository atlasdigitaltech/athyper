REVOKE ALL ON control.cron_schedule FROM PUBLIC;
REVOKE ALL ON FUNCTION control.fn_cron_schedules_for_scheduler() FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON control.cron_schedule TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.cron_schedule TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyperadmin;
    END IF;
END;
$$;
