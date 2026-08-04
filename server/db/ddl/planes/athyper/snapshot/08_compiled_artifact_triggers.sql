CREATE TRIGGER trg_compiled_artifact_10_validate
BEFORE INSERT ON snapshot.compiled_artifact
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_validate_compiled_artifact();

CREATE TRIGGER trg_compiled_artifact_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.compiled_artifact
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
