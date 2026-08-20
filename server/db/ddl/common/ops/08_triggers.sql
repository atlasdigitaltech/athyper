CREATE TRIGGER authorization_parity_certification_immutable
BEFORE UPDATE OR DELETE ON ops.authorization_parity_certification
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_parity_certification();

CREATE TRIGGER authorization_operation_rollout_guard
BEFORE INSERT OR UPDATE OR DELETE ON ops.authorization_operation_rollout
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_rollout_write();

CREATE TRIGGER authorization_operation_cutover_drill_immutable
BEFORE UPDATE OR DELETE ON ops.authorization_operation_cutover_drill
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_operation_cutover_drill();
CREATE TRIGGER authorization_shadow_comparison_immutable
BEFORE UPDATE OR DELETE ON ops.authorization_shadow_comparison
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_authorization_shadow_comparison();

CREATE TRIGGER job_execution_updated_at
    BEFORE UPDATE ON ops.job_execution
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER job_execution_attempt_immutable
    BEFORE UPDATE OR DELETE ON ops.job_execution_attempt
    FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_job_execution_evidence();
CREATE TRIGGER job_execution_command_immutable
    BEFORE UPDATE OR DELETE ON ops.job_execution_command
    FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_job_execution_evidence();
CREATE TRIGGER identity_admission_shadow_immutable BEFORE UPDATE OR DELETE ON ops.identity_admission_shadow_comparison
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_identity_admission_shadow_comparison();
CREATE TRIGGER control_runtime_command_submission_immutable
BEFORE UPDATE OR DELETE ON ops.control_runtime_command_submission
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_control_runtime_evidence();
CREATE TRIGGER control_runtime_command_approval_request_immutable
BEFORE UPDATE OR DELETE ON ops.control_runtime_command_approval_request
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_control_runtime_evidence();
CREATE TRIGGER control_runtime_command_approval_decision_immutable
BEFORE UPDATE OR DELETE ON ops.control_runtime_command_approval_decision
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_control_runtime_evidence();
CREATE TRIGGER control_runtime_command_history_immutable
BEFORE UPDATE OR DELETE ON ops.control_runtime_command_history
FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_control_runtime_evidence();
CREATE TRIGGER control_runtime_command_history_prepare
BEFORE INSERT ON ops.control_runtime_command_history
FOR EACH ROW EXECUTE FUNCTION ops.trg_prepare_control_runtime_history();
