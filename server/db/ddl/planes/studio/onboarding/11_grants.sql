REVOKE ALL ON SCHEMA onboarding FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA onboarding FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA onboarding FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_onboarding_service') THEN
        GRANT USAGE ON SCHEMA onboarding, shared TO athyper_onboarding_service;
        GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyper_onboarding_service;
        REVOKE ALL ON ALL TABLES IN SCHEMA onboarding FROM athyper_onboarding_service;
        REVOKE ALL ON ALL FUNCTIONS IN SCHEMA onboarding FROM athyper_onboarding_service;
        GRANT SELECT ON onboarding.onboarding_case, onboarding.onboarding_case_target,
            onboarding.onboarding_case_step, onboarding.onboarding_step_dependency,
            onboarding.onboarding_case_check, onboarding.onboarding_case_resource,
            onboarding.onboarding_compilation_decision, onboarding.onboarding_case_revision,
            onboarding.onboarding_case_work_item TO athyper_onboarding_service;
        GRANT EXECUTE ON FUNCTION
            onboarding.fn_create_case_with_target(text, uuid, shared.application_plane_d, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, uuid, uuid, onboarding.entry_mode_d, text, onboarding.activation_criticality_d),
            onboarding.fn_advance_case_status(uuid, onboarding.case_status_d, text, uuid),
            onboarding.fn_bind_onboarding_guest_context(uuid, uuid, text),
            onboarding.fn_clear_onboarding_guest_context(),
            onboarding.fn_can_read_onboarding_case(uuid, uuid)
        TO athyper_onboarding_service;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA onboarding TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA onboarding TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA onboarding TO athyperadmin;
    END IF;
END;
$$;
