ALTER TABLE governance.comment_moderation
    ADD CONSTRAINT comment_moderation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT comment_moderation_flag_fk
        FOREIGN KEY (tenant_id, comment_flag_id) REFERENCES event.comment_flag(tenant_id, id),
    ADD CONSTRAINT comment_moderation_moderator_fk
        FOREIGN KEY (tenant_id, moderator_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT comment_moderation_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT comment_moderation_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT comment_moderation_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.channel_consent
    ADD CONSTRAINT channel_consent_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT channel_consent_last_event_fk
        FOREIGN KEY (tenant_id, last_event_id) REFERENCES event.channel_consent_event(tenant_id, id);

ALTER TABLE governance.cycle_run
    ADD CONSTRAINT cycle_run_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_run_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_run_template_revision_fk
        FOREIGN KEY (tenant_id, cycle_type_id, template_revision_id, template_revision_number, template_hash)
        REFERENCES control.cycle_template_revision(tenant_id, cycle_type_id, id, revision_number, template_hash),
    ADD CONSTRAINT cycle_run_parent_fk
        FOREIGN KEY (tenant_id, parent_cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id),
    ADD CONSTRAINT cycle_run_owner_fk
        FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_run_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_run_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_run_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.cycle_task
    ADD CONSTRAINT cycle_task_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_run_fk
        FOREIGN KEY (tenant_id, cycle_type_id, cycle_run_id)
        REFERENCES governance.cycle_run(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_template_fk
        FOREIGN KEY (tenant_id, cycle_type_id, task_template_id)
        REFERENCES control.cycle_task_template(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_phase_fk
        FOREIGN KEY (tenant_id, cycle_type_id, phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_owner_fk
        FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_team_fk
        FOREIGN KEY (tenant_id, assigned_team_id) REFERENCES master.team(tenant_id, id),
    ADD CONSTRAINT cycle_task_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.cycle_task_dependency
    ADD CONSTRAINT cycle_task_dependency_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_dependency_run_fk
        FOREIGN KEY (tenant_id, cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id),
    ADD CONSTRAINT cycle_task_dependency_predecessor_fk
        FOREIGN KEY (tenant_id, cycle_run_id, predecessor_task_id)
        REFERENCES governance.cycle_task(tenant_id, cycle_run_id, id),
    ADD CONSTRAINT cycle_task_dependency_successor_fk
        FOREIGN KEY (tenant_id, cycle_run_id, successor_task_id)
        REFERENCES governance.cycle_task(tenant_id, cycle_run_id, id),
    ADD CONSTRAINT cycle_task_dependency_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.cycle_deviation
    ADD CONSTRAINT cycle_deviation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_deviation_run_fk
        FOREIGN KEY (tenant_id, cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id),
    ADD CONSTRAINT cycle_deviation_task_fk
        FOREIGN KEY (tenant_id, cycle_task_id) REFERENCES governance.cycle_task(tenant_id, id),
    ADD CONSTRAINT cycle_deviation_carry_run_fk
        FOREIGN KEY (tenant_id, carried_to_cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id),
    ADD CONSTRAINT cycle_deviation_carry_source_fk
        FOREIGN KEY (tenant_id, carried_from_deviation_id) REFERENCES governance.cycle_deviation(tenant_id, id),
    ADD CONSTRAINT cycle_deviation_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_deviation_resolved_by_fk
        FOREIGN KEY (tenant_id, resolved_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.cycle_certification
    ADD CONSTRAINT cycle_certification_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_certification_run_fk
        FOREIGN KEY (tenant_id, cycle_run_id) REFERENCES governance.cycle_run(tenant_id, id),
    ADD CONSTRAINT cycle_certification_certified_by_fk
        FOREIGN KEY (tenant_id, certified_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_certification_submitted_by_fk
        FOREIGN KEY (tenant_id, submitted_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_certification_rejected_by_fk
        FOREIGN KEY (tenant_id, rejected_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_certification_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.legal_hold
    ADD CONSTRAINT legal_hold_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT legal_hold_owner_fk
        FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT legal_hold_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT legal_hold_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT legal_hold_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.legal_hold_manifest
    ADD CONSTRAINT legal_hold_manifest_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT legal_hold_manifest_hold_fk
        FOREIGN KEY (tenant_id, legal_hold_id) REFERENCES governance.legal_hold(tenant_id, id),
    ADD CONSTRAINT legal_hold_manifest_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE governance.report_pack
    ADD CONSTRAINT report_pack_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT report_pack_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_report_pack_id) REFERENCES governance.report_pack(tenant_id, id),
    ADD CONSTRAINT report_pack_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT report_pack_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

-- Deferred so the owning P2 command may insert evidence before its run in the same transaction.
ALTER TABLE governance.process_selection_evidence
    ADD CONSTRAINT process_selection_case_fk FOREIGN KEY (tenant_id,case_id)
        REFERENCES document.entity_case(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT process_selection_run_fk FOREIGN KEY (tenant_id,cycle_run_id)
        REFERENCES governance.cycle_run(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE governance.process_attempt
 ADD CONSTRAINT process_attempt_case_fk FOREIGN KEY(tenant_id,case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT process_attempt_snapshot_fk FOREIGN KEY(tenant_id,submission_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE governance.process_attempt
 ADD CONSTRAINT process_attempt_review_pack_fk FOREIGN KEY(tenant_id,review_pack_job_id,id,case_id,cycle_run_id,selection_id)
 REFERENCES governance.process_document_job(tenant_id,id,attempt_id,case_id,cycle_run_id,selection_id) DEFERRABLE INITIALLY DEFERRED;

-- Every supplier task execution belongs to one immutable submission attempt; generic cycles retain NULL.
ALTER TABLE governance.cycle_task ADD CONSTRAINT cycle_task_process_attempt_fk
 FOREIGN KEY(tenant_id,process_attempt_id) REFERENCES governance.process_attempt(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
