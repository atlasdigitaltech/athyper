ALTER TABLE runtime_meta.tenant_usage_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.tenant_usage_counter FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_usage_counter_access ON runtime_meta.tenant_usage_counter
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_usage_counter_seed_write ON runtime_meta.tenant_usage_counter
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
