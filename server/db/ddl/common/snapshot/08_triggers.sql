CREATE TRIGGER trg_entity_snapshot_identity_10_validate
BEFORE INSERT ON snapshot.entity_snapshot_identity
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_validate_entity_snapshot_identity();

CREATE TRIGGER trg_entity_snapshot_identity_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_snapshot_identity
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();

CREATE TRIGGER trg_entity_snapshot_10_validate
BEFORE INSERT ON snapshot.entity_snapshot
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_validate_entity_snapshot_payload();

CREATE TRIGGER trg_entity_snapshot_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_snapshot
FOR EACH ROW
EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
