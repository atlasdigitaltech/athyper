REVOKE ALL ON SCHEMA onboarding FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA onboarding FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA onboarding FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_onboarding_service') THEN
        GRANT USAGE ON SCHEMA onboarding TO athyper_onboarding_service;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA onboarding TO athyper_onboarding_service;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA onboarding TO athyper_onboarding_service;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA onboarding TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA onboarding TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA onboarding TO athyperadmin;
    END IF;
END;
$$;
