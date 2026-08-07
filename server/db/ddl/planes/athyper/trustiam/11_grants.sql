REVOKE ALL ON SCHEMA trustiam FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_trustiam_service') THEN
        GRANT USAGE ON SCHEMA trustiam TO athyper_trustiam_service;
        GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA trustiam TO athyper_trustiam_service;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA trustiam TO athyperadmin;
    END IF;
END;
$$;
