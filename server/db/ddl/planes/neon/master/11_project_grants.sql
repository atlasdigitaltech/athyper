DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA master TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON
            master.project, master.project_wbs, master.project_item
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA master TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            master.project, master.project_wbs, master.project_item
        TO athyperadmin;
    END IF;
END;
$$;
