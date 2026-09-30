REVOKE ALL ON master.canonical_party,master.canonical_party_identifier,master.canonical_party_relationship,master.canonical_party_merge FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_onboarding_service') THEN
  GRANT SELECT,INSERT,UPDATE ON master.canonical_party,master.canonical_party_identifier,master.canonical_party_relationship TO athyper_onboarding_service;
  GRANT SELECT,INSERT ON master.canonical_party_merge TO athyper_onboarding_service;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_trustiam_service') THEN
  GRANT SELECT ON master.canonical_party,master.canonical_party_identifier,master.canonical_party_relationship TO athyper_trustiam_service;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  GRANT ALL ON master.canonical_party,master.canonical_party_identifier,master.canonical_party_relationship,master.canonical_party_merge TO athyperadmin;
 END IF;
END $$;

REVOKE ALL ON SCHEMA master FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA master FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA master FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA master TO athyperapp;

        GRANT SELECT ON
            master.tenant,
            master.tenant_relationship,
            master.workspace,
            master.module
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.tenant_profile
            TO athyperapp;

        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.address,
               master.address_link,
               master.contact_link,
               master.contact_email,
               master.contact_phone,
               master.external_reference
            TO athyperapp;
        GRANT SELECT, INSERT ON master.address_event TO athyperapp;

        GRANT SELECT ON master.principal, master.principal_identity_binding TO athyperapp;
        GRANT SELECT ON
            master.team,
            master.team_member
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.principal_profile,
               master.principal_ui_profile
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON master.principal_ui_preference,
               master.principal_notification_preference
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.saved_view
            TO athyperapp;
        GRANT SELECT, INSERT, DELETE
            ON master.record_bookmark
            TO athyperapp;
        GRANT SELECT, INSERT, UPDATE
            ON master.brand_profile,
               master.letterhead,
               master.print_profile,
               master.template,
               master.template_binding
            TO athyperapp;
        GRANT SELECT ON master.principal_directory TO athyperapp;

        GRANT EXECUTE ON FUNCTION master.current_principal_id_soft()
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION master.fn_resolve_principal_identity(
            uuid, master.identity_provider_d, text, text
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA master TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA master TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA master TO athyperadmin;
    END IF;
END;
$$;
