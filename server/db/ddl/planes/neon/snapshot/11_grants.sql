REVOKE ALL ON SCHEMA snapshot FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA snapshot FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA snapshot FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperapp;
        GRANT SELECT, INSERT ON snapshot.template_version TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA snapshot TO athyperadmin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA snapshot TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA snapshot TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON snapshot.mesh_business_partner_profile_received FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
    snapshot.mesh_business_partner_profile_payload_is_safe(jsonb),
    snapshot.trg_guard_mesh_business_partner_profile_received()
FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT ON snapshot.mesh_business_partner_profile_received TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.mesh_business_partner_profile_payload_is_safe(jsonb) TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON snapshot.mesh_business_partner_profile_received TO athyperadmin;
    END IF;
END;
$$;

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
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON snapshot.mesh_bank_account_disclosure_received TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON snapshot.mesh_bank_account_disclosure_received TO athyperadmin; END IF; END $$;
