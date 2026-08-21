REVOKE ALL ON SCHEMA shared FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA shared FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA shared FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA shared TO athyperapp;
        GRANT SELECT ON
            shared.country,
            shared.currency,
            shared.language,
            shared.locale,
            shared.timezone,
            shared.uom,
            shared.state_region,
            shared.classification_scheme,
            shared.commodity_code,
            shared.industry_code,
            shared.commodity_crosswalk,
            shared.industry_crosswalk
        TO athyperapp;

        GRANT EXECUTE ON FUNCTION shared.uuidv7() TO athyperapp;
        GRANT EXECUTE ON FUNCTION shared.current_tenant_id() TO athyperapp;
        GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyperapp;
        GRANT EXECUTE ON FUNCTION shared.normalize_locale_code(text) TO athyperapp;
        GRANT EXECUTE ON FUNCTION shared.fn_validate_postal_code(text, text) TO athyperapp;
        GRANT EXECUTE ON FUNCTION shared.fn_validate_phone(text, text) TO athyperapp;
        GRANT EXECUTE ON FUNCTION shared.fn_resolve_calling_code(text) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA shared TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA shared TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shared TO athyperadmin;
    END IF;
END;
$$;
