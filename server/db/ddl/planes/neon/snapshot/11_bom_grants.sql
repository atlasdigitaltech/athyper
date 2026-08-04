DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperapp;
        GRANT SELECT, INSERT ON
            snapshot.bom,
            snapshot.bom_component
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            snapshot.bom,
            snapshot.bom_component
        TO athyperadmin;
    END IF;
END;
$$;
