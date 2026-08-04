DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA control TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            control.planning_model,
            control.planning_driver,
            control.planning_driver_dependency
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA control TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            control.planning_model,
            control.planning_driver,
            control.planning_driver_dependency
        TO athyperadmin;
    END IF;
END;
$$;
