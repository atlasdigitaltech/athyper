ALTER TABLE control.risk_source_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.risk_source_config FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON control.risk_source_config
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON control.risk_source_config
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
