CREATE TRIGGER trg_compensation_assignment_00_created_by BEFORE INSERT ON master.compensation_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_compensation_assignment_05_evidence BEFORE UPDATE ON master.compensation_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_master_evidence();
CREATE TRIGGER trg_compensation_assignment_10_contract BEFORE INSERT OR UPDATE ON master.compensation_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_compensation_assignment();
CREATE TRIGGER trg_compensation_assignment_15_state BEFORE INSERT OR UPDATE ON master.compensation_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_manage_compensation_assignment();
CREATE TRIGGER trg_compensation_assignment_20_status BEFORE UPDATE OF status ON master.compensation_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_compensation_assignment_90_updated BEFORE UPDATE ON master.compensation_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
