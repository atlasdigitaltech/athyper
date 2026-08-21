ALTER TABLE ops.authorization_shadow_comparison
    ADD CONSTRAINT authorization_shadow_comparison_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT authorization_shadow_comparison_principal_fk
        FOREIGN KEY (tenant_id,principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE ops.job_execution
    ADD CONSTRAINT job_execution_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT job_execution_schedule_fk
        FOREIGN KEY (cron_schedule_id) REFERENCES control.cron_schedule(id) ON DELETE SET NULL,
    ADD CONSTRAINT job_execution_parent_fk
        FOREIGN KEY (parent_execution_id) REFERENCES ops.job_execution(id) ON DELETE SET NULL,
    ADD CONSTRAINT job_execution_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_execution_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ops.job_execution_attempt
    ADD CONSTRAINT job_execution_attempt_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT job_execution_attempt_execution_fk
        FOREIGN KEY (execution_id) REFERENCES ops.job_execution(id) ON DELETE CASCADE,
    ADD CONSTRAINT job_execution_attempt_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ops.job_execution_command
    ADD CONSTRAINT job_execution_command_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT job_execution_command_execution_fk
        FOREIGN KEY (execution_id) REFERENCES ops.job_execution(id) ON DELETE CASCADE,
    ADD CONSTRAINT job_execution_command_requested_by_fk
        FOREIGN KEY (requested_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT job_execution_command_replacement_fk
        FOREIGN KEY (replacement_execution_id) REFERENCES ops.job_execution(id) ON DELETE SET NULL;
ALTER TABLE ops.identity_admission_shadow_comparison
  ADD CONSTRAINT identity_admission_shadow_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE ops.authorization_session_shadow_comparison
  ADD CONSTRAINT authorization_session_shadow_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT authorization_session_shadow_principal_fk FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE ops.record_edit_lock
    ADD CONSTRAINT record_edit_lock_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT record_edit_lock_owner_fk FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
