REVOKE ALL ON ALL TABLES IN SCHEMA governance FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA governance FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA governance TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA governance TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA governance TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA governance TO athyperadmin;
    END IF;
END;
$$;
