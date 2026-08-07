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
ALTER TABLE ops.identity_admission_shadow_comparison
  ADD CONSTRAINT identity_admission_shadow_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE ops.authorization_session_shadow_comparison
  ADD CONSTRAINT authorization_session_shadow_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  ADD CONSTRAINT authorization_session_shadow_principal_fk FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
