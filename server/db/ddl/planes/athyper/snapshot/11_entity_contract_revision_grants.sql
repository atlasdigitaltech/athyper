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
