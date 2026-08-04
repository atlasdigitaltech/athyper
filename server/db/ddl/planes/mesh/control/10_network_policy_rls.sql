ALTER TABLE control.routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.routing_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE control.retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.retention_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE control.quota_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.quota_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY routing_rule_admin_access ON control.routing_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY routing_rule_account_access ON control.routing_rule
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft()
           AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND network_account_id = mesh.current_network_account_id_soft());
CREATE POLICY retention_policy_admin_access ON control.retention_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY retention_policy_account_access ON control.retention_policy
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft()
           AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND network_account_id = mesh.current_network_account_id_soft());
CREATE POLICY quota_policy_admin_access ON control.quota_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY quota_policy_account_access ON control.quota_policy
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft()
           AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id()
                AND network_account_id = mesh.current_network_account_id_soft());
