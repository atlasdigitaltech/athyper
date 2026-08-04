CREATE TRIGGER trg_budget_transaction_00_created_by
BEFORE INSERT ON ledger.budget_transaction
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_budget_transaction_90_no_update
BEFORE UPDATE OR DELETE ON ledger.budget_transaction
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_mutation();

CREATE TRIGGER trg_budget_balance_00_created_by
BEFORE INSERT ON ledger.budget_balance
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_budget_balance_10_identity
BEFORE UPDATE ON ledger.budget_balance
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_identity_evidence();
CREATE TRIGGER trg_budget_balance_90_updated_at
BEFORE UPDATE ON ledger.budget_balance
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_planning_run_00_created_by
BEFORE INSERT ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_planning_run_05_validate
BEFORE INSERT ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_planning_run();
CREATE TRIGGER trg_planning_run_10_identity
BEFORE UPDATE ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_identity_evidence();
CREATE TRIGGER trg_planning_run_15_scope
BEFORE UPDATE ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_planning_run();
CREATE TRIGGER trg_planning_run_80_status
BEFORE UPDATE OF status ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_stamp_run_status();
CREATE TRIGGER trg_planning_run_90_updated_at
BEFORE UPDATE ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_planning_output_00_created_by
BEFORE INSERT ON ledger.planning_output
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_planning_output_90_no_update
BEFORE UPDATE OR DELETE ON ledger.planning_output
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_mutation();
