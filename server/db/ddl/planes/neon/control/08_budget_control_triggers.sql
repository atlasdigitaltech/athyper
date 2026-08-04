CREATE TRIGGER trg_budget_control_policy_00_created_by
BEFORE INSERT ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_budget_control_policy_05_validate
BEFORE INSERT OR UPDATE ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_budget_control_policy();

CREATE TRIGGER trg_budget_control_policy_10_status
BEFORE UPDATE OF status ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_budget_control_policy_20_guard
BEFORE UPDATE OR DELETE ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_budget_control_policy();

CREATE TRIGGER trg_budget_control_policy_90_updated
BEFORE UPDATE ON control.budget_control_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
