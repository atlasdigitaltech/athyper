CREATE TRIGGER trg_entity_contract_guard
BEFORE UPDATE OR DELETE ON runtime_meta.entity_contract
FOR EACH ROW EXECUTE FUNCTION runtime_meta.trg_guard_entity_contract();
