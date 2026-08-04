CREATE TRIGGER trg_entity_release_artifact_10_validate
BEFORE INSERT ON snapshot.entity_release_artifact
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_release_artifact();

CREATE TRIGGER trg_entity_release_artifact_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_release_artifact
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_release_artifact_mutation();
