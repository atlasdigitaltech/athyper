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
