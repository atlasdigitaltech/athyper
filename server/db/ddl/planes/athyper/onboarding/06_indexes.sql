CREATE INDEX onboarding_case_tenant_status_idx
    ON onboarding.onboarding_case (tenant_id, status, created_at DESC);

CREATE INDEX onboarding_case_subject_idx
    ON onboarding.onboarding_case (tenant_id, subject_principal_id)
    WHERE subject_principal_id IS NOT NULL;

CREATE INDEX onboarding_case_plan_idx
    ON onboarding.onboarding_case (tenant_id, requested_plan_id, status)
    WHERE requested_plan_id IS NOT NULL;

CREATE INDEX onboarding_case_requested_by_idx
    ON onboarding.onboarding_case (tenant_id, requested_by_principal_id);

CREATE INDEX onboarding_case_snapshot_fk_idx
    ON onboarding.onboarding_case (tenant_id, snapshot_identity_id)
    WHERE snapshot_identity_id IS NOT NULL;

CREATE INDEX onboarding_case_command_fk_idx
    ON onboarding.onboarding_case (tenant_id, command_execution_id)
    WHERE command_execution_id IS NOT NULL;

CREATE INDEX onboarding_case_outbox_fk_idx
    ON onboarding.onboarding_case (tenant_id, outbox_id)
    WHERE outbox_id IS NOT NULL;

CREATE INDEX onboarding_case_audit_log_fk_idx
    ON onboarding.onboarding_case (tenant_id, audit_log_id)
    WHERE audit_log_id IS NOT NULL;

CREATE INDEX onboarding_case_security_event_fk_idx
    ON onboarding.onboarding_case (tenant_id, security_event_id)
    WHERE security_event_id IS NOT NULL;

CREATE INDEX onboarding_case_target_case_idx
    ON onboarding.onboarding_case_target (tenant_id, onboarding_case_id, target_plane, status);

CREATE INDEX onboarding_case_target_tenant_idx
    ON onboarding.onboarding_case_target (target_tenant_id, status);

CREATE INDEX onboarding_case_step_case_idx
    ON onboarding.onboarding_case_step (tenant_id, onboarding_case_id, status, execution_priority);

CREATE INDEX onboarding_case_step_target_idx
    ON onboarding.onboarding_case_step (tenant_id, onboarding_case_target_id, status)
    WHERE onboarding_case_target_id IS NOT NULL;

CREATE INDEX onboarding_case_step_snapshot_fk_idx
    ON onboarding.onboarding_case_step (tenant_id, snapshot_identity_id)
    WHERE snapshot_identity_id IS NOT NULL;

CREATE INDEX onboarding_case_step_command_fk_idx
    ON onboarding.onboarding_case_step (tenant_id, command_execution_id)
    WHERE command_execution_id IS NOT NULL;

CREATE INDEX onboarding_case_step_outbox_fk_idx
    ON onboarding.onboarding_case_step (tenant_id, outbox_id)
    WHERE outbox_id IS NOT NULL;

CREATE INDEX onboarding_case_step_audit_log_fk_idx
    ON onboarding.onboarding_case_step (tenant_id, audit_log_id)
    WHERE audit_log_id IS NOT NULL;

CREATE INDEX onboarding_case_step_security_event_fk_idx
    ON onboarding.onboarding_case_step (tenant_id, security_event_id)
    WHERE security_event_id IS NOT NULL;

CREATE INDEX onboarding_step_dependency_case_idx
    ON onboarding.onboarding_step_dependency (tenant_id, onboarding_case_id, depends_on_step_id);

CREATE INDEX onboarding_case_check_case_idx
    ON onboarding.onboarding_case_check (tenant_id, onboarding_case_id, result, resource_type);

CREATE INDEX onboarding_case_check_step_idx
    ON onboarding.onboarding_case_check (tenant_id, onboarding_case_step_id, result);

CREATE INDEX onboarding_case_check_snapshot_fk_idx
    ON onboarding.onboarding_case_check (tenant_id, snapshot_identity_id)
    WHERE snapshot_identity_id IS NOT NULL;

CREATE INDEX onboarding_case_check_command_fk_idx
    ON onboarding.onboarding_case_check (tenant_id, command_execution_id)
    WHERE command_execution_id IS NOT NULL;

CREATE INDEX onboarding_case_check_outbox_fk_idx
    ON onboarding.onboarding_case_check (tenant_id, outbox_id)
    WHERE outbox_id IS NOT NULL;

CREATE INDEX onboarding_case_check_audit_log_fk_idx
    ON onboarding.onboarding_case_check (tenant_id, audit_log_id)
    WHERE audit_log_id IS NOT NULL;

CREATE INDEX onboarding_case_check_security_event_fk_idx
    ON onboarding.onboarding_case_check (tenant_id, security_event_id)
    WHERE security_event_id IS NOT NULL;

CREATE INDEX onboarding_case_resource_case_idx
    ON onboarding.onboarding_case_resource (tenant_id, onboarding_case_id, resource_status);

CREATE INDEX onboarding_case_resource_target_idx
    ON onboarding.onboarding_case_resource (tenant_id, onboarding_case_target_id, resource_kind)
    WHERE onboarding_case_target_id IS NOT NULL;

CREATE INDEX onboarding_case_resource_snapshot_fk_idx
    ON onboarding.onboarding_case_resource (tenant_id, snapshot_identity_id)
    WHERE snapshot_identity_id IS NOT NULL;

CREATE INDEX onboarding_case_resource_command_fk_idx
    ON onboarding.onboarding_case_resource (tenant_id, command_execution_id)
    WHERE command_execution_id IS NOT NULL;

CREATE INDEX onboarding_case_resource_outbox_fk_idx
    ON onboarding.onboarding_case_resource (tenant_id, outbox_id)
    WHERE outbox_id IS NOT NULL;

CREATE INDEX onboarding_compilation_decision_case_idx
    ON onboarding.onboarding_compilation_decision (tenant_id, onboarding_case_id, decision_status);

CREATE INDEX onboarding_compilation_decision_snapshot_fk_idx
    ON onboarding.onboarding_compilation_decision (tenant_id, snapshot_identity_id)
    WHERE snapshot_identity_id IS NOT NULL;

CREATE INDEX onboarding_compilation_decision_command_fk_idx
    ON onboarding.onboarding_compilation_decision (tenant_id, command_execution_id)
    WHERE command_execution_id IS NOT NULL;

CREATE INDEX onboarding_compilation_decision_outbox_fk_idx
    ON onboarding.onboarding_compilation_decision (tenant_id, outbox_id)
    WHERE outbox_id IS NOT NULL;

CREATE INDEX onboarding_compilation_decision_audit_log_fk_idx
    ON onboarding.onboarding_compilation_decision (tenant_id, audit_log_id)
    WHERE audit_log_id IS NOT NULL;

CREATE INDEX onboarding_compilation_decision_security_event_fk_idx
    ON onboarding.onboarding_compilation_decision (tenant_id, security_event_id)
    WHERE security_event_id IS NOT NULL;

CREATE INDEX onboarding_case_revision_case_idx
    ON onboarding.onboarding_case_revision (tenant_id, onboarding_case_id, revision_no);

CREATE INDEX onboarding_case_work_item_idx
    ON onboarding.onboarding_case_work_item (tenant_id, onboarding_case_id, work_item_id);

CREATE INDEX onboarding_case_guest_access_case_idx
    ON onboarding.onboarding_case_guest_access (tenant_id, onboarding_case_id, token_hash)
    WHERE revoked_at IS NULL;

CREATE INDEX onboarding_case_guest_access_audit_idx
    ON onboarding.onboarding_case_guest_access (tenant_id, revoked_by_principal_id)
    WHERE revoked_at IS NOT NULL;
