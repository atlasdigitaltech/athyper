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
