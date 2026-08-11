CREATE TRIGGER trg_template_version_00_created_by
BEFORE INSERT ON snapshot.template_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_set_template_version_created_by();

CREATE TRIGGER trg_template_version_immutable
BEFORE UPDATE OR DELETE ON snapshot.template_version
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_template_version_mutation();

CREATE TRIGGER trg_compiled_artifact_10_validate
BEFORE INSERT ON snapshot.compiled_artifact
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_validate_compiled_artifact();

CREATE TRIGGER trg_compiled_artifact_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.compiled_artifact
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();

CREATE TRIGGER trg_entity_contract_revision_10_validate
BEFORE INSERT ON snapshot.entity_contract_revision
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_contract_revision();

CREATE TRIGGER trg_entity_contract_revision_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_contract_revision
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();

CREATE TRIGGER trg_entity_contract_test_run_10_validate BEFORE INSERT ON snapshot.entity_contract_test_run
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_contract_test_run();
CREATE TRIGGER trg_entity_contract_test_run_90_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_contract_test_run
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_contract_test_artifact_mutation();
CREATE TRIGGER trg_entity_contract_test_result_10_validate BEFORE INSERT ON snapshot.entity_contract_test_result
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_contract_test_result();
CREATE TRIGGER trg_entity_contract_test_result_90_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_contract_test_result
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_contract_test_artifact_mutation();

CREATE TRIGGER entity_numbering_test_artifact_10_validate
BEFORE INSERT ON snapshot.entity_numbering_test_artifact
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_numbering_test_artifact();

CREATE TRIGGER entity_numbering_test_artifact_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_numbering_test_artifact
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_numbering_test_artifact_mutation();

CREATE TRIGGER trg_entity_release_artifact_10_validate
BEFORE INSERT ON snapshot.entity_release_artifact
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_release_artifact();

CREATE TRIGGER trg_entity_release_artifact_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_release_artifact
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_release_artifact_mutation();
