ALTER TABLE control.cron_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.cron_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY cron_schedule_read ON control.cron_schedule FOR SELECT TO athyperapp
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY cron_schedule_tenant_write ON control.cron_schedule FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY cron_schedule_seed_write ON control.cron_schedule FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
