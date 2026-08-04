ALTER TABLE control.cron_schedule
    ADD CONSTRAINT cron_schedule_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT cron_schedule_timezone_fk FOREIGN KEY (timezone) REFERENCES shared.timezone(code) ON DELETE RESTRICT;
