CREATE INDEX cron_schedule_due_idx ON control.cron_schedule (is_enabled, effective_from, effective_until, code) WHERE is_enabled;
CREATE INDEX cron_schedule_tenant_idx ON control.cron_schedule (tenant_id, code) WHERE tenant_id IS NOT NULL;
