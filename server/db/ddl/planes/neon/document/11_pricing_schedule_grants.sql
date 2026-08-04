DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            document.pricing_component,
            document.schedule_line
        TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_pricing_component() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_guard_pricing_component_write() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_schedule_line() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_schedule_capacity() TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.pricing_component,
            document.schedule_line
        TO athyperadmin;
    END IF;
END $$;
