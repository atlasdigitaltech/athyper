REVOKE ALL ON document.planning_scenario, document.planning_scenario_line FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON document.planning_scenario TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON document.planning_scenario_line TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.planning_scenario,
            document.planning_scenario_line
        TO athyperadmin;
    END IF;
END;
$$;
