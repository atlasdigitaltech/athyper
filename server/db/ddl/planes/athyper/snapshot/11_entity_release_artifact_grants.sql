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
