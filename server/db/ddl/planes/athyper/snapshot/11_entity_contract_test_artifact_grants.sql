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
