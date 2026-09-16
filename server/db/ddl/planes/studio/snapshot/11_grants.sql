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

REVOKE ALL ON snapshot.compiled_artifact FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_compute_compiled_artifact_hash(
    uuid, text, text, text, text, text, text, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_publish_compiled_artifact(
    uuid, text, text, text, text, jsonb, jsonb, numeric
) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON snapshot.compiled_artifact TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_publish_compiled_artifact(
            uuid, text, text, text, text, jsonb, jsonb, numeric
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON snapshot.compiled_artifact TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_compiled_artifact_hash(
            uuid, text, text, text, text, text, text, jsonb
        ) TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_publish_compiled_artifact(
            uuid, text, text, text, text, jsonb, jsonb, numeric
        ) TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON snapshot.entity_contract_revision FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_hash(jsonb)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_revision_hash(
    uuid, uuid, uuid, integer, text, uuid, text, text, text, text[],
    metadata.compatibility_level_d,
    metadata.contract_validation_status_d,
    jsonb, timestamptz, uuid
) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT ON snapshot.entity_contract_revision TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_hash(jsonb)
            TO athyperapp;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_revision_hash(
            uuid, uuid, uuid, integer, text, uuid, text, text, text, text[],
            metadata.compatibility_level_d,
            metadata.contract_validation_status_d,
            jsonb, timestamptz, uuid
        ) TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON snapshot.entity_contract_revision TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_hash(jsonb)
            TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_contract_revision_hash(
            uuid, uuid, uuid, integer, text, uuid, text, text, text, text[],
            metadata.compatibility_level_d,
            metadata.contract_validation_status_d,
            jsonb, timestamptz, uuid
        ) TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON snapshot.entity_contract_test_run, snapshot.entity_contract_test_result FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.trg_reject_entity_contract_test_artifact_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.trg_validate_entity_contract_test_run() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.trg_validate_entity_contract_test_result() FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT ON snapshot.entity_contract_test_run, snapshot.entity_contract_test_result TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON snapshot.entity_contract_test_run, snapshot.entity_contract_test_result TO athyperadmin;
    END IF;
END; $$;

REVOKE ALL ON snapshot.entity_numbering_test_artifact FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.trg_reject_entity_numbering_test_artifact_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.trg_validate_entity_numbering_test_artifact() FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT ON snapshot.entity_numbering_test_artifact TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON snapshot.entity_numbering_test_artifact TO athyperadmin;
    END IF;
END; $$;

REVOKE ALL ON snapshot.entity_release_artifact FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION snapshot.fn_compute_entity_release_artifact_hash(
    uuid, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC;

GRANT SELECT ON snapshot.entity_release_artifact TO athyperapp;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT SELECT, INSERT ON snapshot.entity_release_artifact TO athyperadmin;
        GRANT EXECUTE ON FUNCTION snapshot.fn_compute_entity_release_artifact_hash(
            uuid, uuid, uuid, text, text, text, jsonb
        ) TO athyperadmin;
    END IF;
END
$$;
REVOKE ALL ON snapshot.business_partner_definition_revision FROM PUBLIC;
REVOKE ALL ON FUNCTION snapshot.trg_guard_business_partner_definition_revision() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_publication_service') THEN
    GRANT USAGE ON SCHEMA snapshot, shared TO athyper_publication_service;
    GRANT EXECUTE ON FUNCTION shared.current_tenant_id(), shared.current_tenant_id_soft() TO athyper_publication_service;
    GRANT SELECT,INSERT ON snapshot.business_partner_definition_revision TO athyper_publication_service;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL PRIVILEGES ON snapshot.business_partner_definition_revision TO athyperadmin;
  END IF;
END $$;

REVOKE ALL ON snapshot.business_partner_case_contract_revision FROM PUBLIC;
REVOKE ALL ON FUNCTION snapshot.trg_reject_case_contract_mutation() FROM PUBLIC;
GRANT SELECT, INSERT ON snapshot.business_partner_case_contract_revision TO athyper_publication_service;

-- Saved draft comparison history
GRANT SELECT, INSERT ON snapshot.entity_draft_save TO athyperapp;
