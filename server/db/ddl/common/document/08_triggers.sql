CREATE TRIGGER work_item_identity_guard
BEFORE UPDATE ON document.work_item
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_work_item_identity();
CREATE TRIGGER work_item_status_changed
BEFORE UPDATE OF status ON document.work_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER work_item_updated_at
BEFORE UPDATE ON document.work_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER entity_case_command_guard BEFORE INSERT OR UPDATE OR DELETE ON document.entity_case
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_entity_case_mutation();
CREATE TRIGGER entity_case_status_changed BEFORE UPDATE OF status ON document.entity_case
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER entity_case_updated_at BEFORE UPDATE ON document.entity_case
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER entity_case_command_evidence_immutable BEFORE UPDATE OR DELETE ON document.entity_case_command_evidence
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
CREATE TRIGGER entity_case_validation_immutable BEFORE UPDATE OR DELETE ON document.entity_case_validation
FOR EACH ROW EXECUTE FUNCTION snapshot.trg_reject_entity_snapshot_mutation();
