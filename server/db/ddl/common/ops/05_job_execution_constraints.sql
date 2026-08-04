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
