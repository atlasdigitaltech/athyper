REVOKE ALL ON SCHEMA snapshot FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA snapshot FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA snapshot FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperapp;
        GRANT SELECT, INSERT ON snapshot.template_version,snapshot.network_account_profile_publication,snapshot.bank_account_disclosure TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA snapshot TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA snapshot TO athyperadmin;
    END IF;
END;
$$;
