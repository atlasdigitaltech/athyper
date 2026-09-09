REVOKE ALL ON SCHEMA shared FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA shared FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA shared FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA shared TO athyperapp;
        GRANT SELECT ON
            shared.bank_directory_release,
            shared.bank_institution, shared.bank_branch,
            shared.bank_institution_version, shared.bank_branch_version,
            shared.bank_identifier, shared.bank_directory_source_record,
            shared.bank_directory_activation, shared.v_bank_institution,
            shared.v_bank_branch, shared.v_bank_directory,
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

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_jobs_service') THEN
        GRANT USAGE ON SCHEMA shared TO athyper_jobs_service;
        GRANT EXECUTE ON FUNCTION shared.uuidv7() TO athyper_jobs_service;
        GRANT EXECUTE ON FUNCTION shared.current_tenant_id() TO athyper_jobs_service;
        GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyper_jobs_service;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA shared TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA shared TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shared TO athyperadmin;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION shared.validate_bank_directory(jsonb) TO athyper_publication_service;
GRANT USAGE ON SCHEMA shared TO athyper_publication_service,athyper_projection_applier;
GRANT SELECT ON shared.country,shared.bank_directory_release,shared.bank_directory_activation,
 shared.bank_identifier,shared.bank_institution_version,shared.bank_branch_version TO athyper_publication_service,athyper_projection_applier;
GRANT EXECUTE ON FUNCTION shared.resolve_bank_directory_reference(uuid,uuid,uuid) TO athyperapp,athyper_publication_service,athyper_projection_applier;
