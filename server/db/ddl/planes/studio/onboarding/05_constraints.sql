ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_tenant_fk
        FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_canonical_party_fk
        FOREIGN KEY (tenant_id, canonical_party_id)
        REFERENCES master.canonical_party (authority_tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_requested_plan_fk
        FOREIGN KEY (requested_plan_id)
        REFERENCES control.subscription_plan (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_requested_workspace_fk
        FOREIGN KEY (requested_workspace_id)
        REFERENCES master.workspace (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_requested_module_fk
        FOREIGN KEY (requested_module_id)
        REFERENCES master.module (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_requested_flow_fk
        FOREIGN KEY (tenant_id, requested_flow_id)
        REFERENCES metadata.entity_flow (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_requested_by_principal_fk
        FOREIGN KEY (tenant_id, requested_by_principal_id)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_subject_principal_fk
        FOREIGN KEY (tenant_id, subject_principal_id)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_decision_by_fk
        FOREIGN KEY (tenant_id, decided_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_snapshot_fk
        FOREIGN KEY (tenant_id, snapshot_identity_id)
        REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_command_fk
        FOREIGN KEY (tenant_id, command_execution_id)
        REFERENCES event.command_execution (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case
    ADD CONSTRAINT onboarding_case_outbox_fk
        FOREIGN KEY (tenant_id, outbox_id)
        REFERENCES event.outbox (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_tenant_fk
        FOREIGN KEY (target_tenant_id)
        REFERENCES master.tenant (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_projection_fk
        FOREIGN KEY (tenant_id, requested_projection_id)
        REFERENCES authz.application_projection (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_plan_fk
        FOREIGN KEY (requested_plan_id)
        REFERENCES control.subscription_plan (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_workspace_fk
        FOREIGN KEY (requested_workspace_id)
        REFERENCES master.workspace (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_module_fk
        FOREIGN KEY (requested_module_id)
        REFERENCES master.module (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_scope_fk
        FOREIGN KEY (tenant_id, requested_scope_target_id)
        REFERENCES authz.scope_target (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_decided_by_fk
        FOREIGN KEY (tenant_id, decided_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_target
    ADD CONSTRAINT onboarding_case_target_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_target_fk
        FOREIGN KEY (tenant_id, onboarding_case_target_id)
        REFERENCES onboarding.onboarding_case_target (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_flow_step_fk
        FOREIGN KEY (tenant_id, source_flow_step_id)
        REFERENCES metadata.entity_flow_step (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_snapshot_fk
        FOREIGN KEY (tenant_id, snapshot_identity_id)
        REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_command_fk
        FOREIGN KEY (tenant_id, command_execution_id)
        REFERENCES event.command_execution (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_step
    ADD CONSTRAINT onboarding_case_step_outbox_fk
        FOREIGN KEY (tenant_id, outbox_id)
        REFERENCES event.outbox (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_step_dependency
    ADD CONSTRAINT onboarding_step_dependency_tenant_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_step_dependency
    ADD CONSTRAINT onboarding_step_dependency_from_step_fk
        FOREIGN KEY (tenant_id, depends_on_step_id)
        REFERENCES onboarding.onboarding_case_step (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_step_dependency
    ADD CONSTRAINT onboarding_step_dependency_to_step_fk
        FOREIGN KEY (tenant_id, depends_on_this_step_id)
        REFERENCES onboarding.onboarding_case_step (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_step_fk
        FOREIGN KEY (tenant_id, onboarding_case_step_id)
        REFERENCES onboarding.onboarding_case_step (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_target_fk
        FOREIGN KEY (tenant_id, onboarding_case_target_id)
        REFERENCES onboarding.onboarding_case_target (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_result_changed_by_fk
        FOREIGN KEY (tenant_id, result_changed_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_snapshot_fk
        FOREIGN KEY (tenant_id, snapshot_identity_id)
        REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_command_fk
        FOREIGN KEY (tenant_id, command_execution_id)
        REFERENCES event.command_execution (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_check
    ADD CONSTRAINT onboarding_case_check_outbox_fk
        FOREIGN KEY (tenant_id, outbox_id)
        REFERENCES event.outbox (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_target_fk
        FOREIGN KEY (tenant_id, onboarding_case_target_id)
        REFERENCES onboarding.onboarding_case_target (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_snapshot_fk
        FOREIGN KEY (tenant_id, snapshot_identity_id)
        REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_command_fk
        FOREIGN KEY (tenant_id, command_execution_id)
        REFERENCES event.command_execution (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_outbox_fk
        FOREIGN KEY (tenant_id, outbox_id)
        REFERENCES event.outbox (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_resource
    ADD CONSTRAINT onboarding_case_resource_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_target_fk
        FOREIGN KEY (tenant_id, onboarding_case_target_id)
        REFERENCES onboarding.onboarding_case_target (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_plan_fk
        FOREIGN KEY (approved_plan_id)
        REFERENCES control.subscription_plan (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_workspace_fk
        FOREIGN KEY (approved_workspace_id)
        REFERENCES master.workspace (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_module_fk
        FOREIGN KEY (approved_module_id)
        REFERENCES master.module (id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_projection_fk
        FOREIGN KEY (tenant_id, approved_projection_id)
        REFERENCES authz.application_projection (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_decided_by_fk
        FOREIGN KEY (tenant_id, decided_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_snapshot_fk
        FOREIGN KEY (tenant_id, snapshot_identity_id)
        REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_command_fk
        FOREIGN KEY (tenant_id, command_execution_id)
        REFERENCES event.command_execution (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_compilation_decision
    ADD CONSTRAINT onboarding_compilation_decision_outbox_fk
        FOREIGN KEY (tenant_id, outbox_id)
        REFERENCES event.outbox (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_revision
    ADD CONSTRAINT onboarding_case_revision_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_revision
    ADD CONSTRAINT onboarding_case_revision_changed_by_fk
        FOREIGN KEY (tenant_id, changed_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_work_item
    ADD CONSTRAINT onboarding_case_work_item_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_work_item
    ADD CONSTRAINT onboarding_case_work_item_work_item_fk
        FOREIGN KEY (tenant_id, work_item_id)
        REFERENCES document.work_item (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_work_item
    ADD CONSTRAINT onboarding_case_work_item_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_guest_access
    ADD CONSTRAINT onboarding_case_guest_access_case_fk
        FOREIGN KEY (tenant_id, onboarding_case_id)
        REFERENCES onboarding.onboarding_case (tenant_id, id)
        ON DELETE CASCADE;

ALTER TABLE onboarding.onboarding_case_guest_access
    ADD CONSTRAINT onboarding_case_guest_access_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_guest_access
    ADD CONSTRAINT onboarding_case_guest_access_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;

ALTER TABLE onboarding.onboarding_case_guest_access
    ADD CONSTRAINT onboarding_case_guest_access_revoked_by_fk
        FOREIGN KEY (tenant_id, revoked_by_principal_id)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE RESTRICT;
