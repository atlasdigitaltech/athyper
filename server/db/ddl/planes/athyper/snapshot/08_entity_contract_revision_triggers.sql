CREATE TRIGGER trg_entity_contract_revision_10_validate
BEFORE INSERT ON snapshot.entity_contract_revision
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_validate_entity_contract_revision();

CREATE TRIGGER trg_entity_contract_revision_90_immutable
BEFORE UPDATE OR DELETE ON snapshot.entity_contract_revision
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
