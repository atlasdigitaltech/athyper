ALTER TABLE control.usage_metric_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.usage_metric_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_metric_catalog_read ON control.usage_metric_catalog
    FOR SELECT USING (true);
CREATE POLICY usage_metric_catalog_seed_write ON control.usage_metric_catalog
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.subscription_plan_usage_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.subscription_plan_usage_limit FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_plan_usage_limit_read ON control.subscription_plan_usage_limit
    FOR SELECT USING (true);
CREATE POLICY subscription_plan_usage_limit_seed_write ON control.subscription_plan_usage_limit
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE control.tenant_usage_limit_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.tenant_usage_limit_override FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_usage_limit_override_read ON control.tenant_usage_limit_override
    FOR SELECT
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_usage_limit_override_seed_write ON control.tenant_usage_limit_override
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
