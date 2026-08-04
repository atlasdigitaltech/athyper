ALTER TABLE control.delivery_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.delivery_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_policy_account_read ON control.delivery_policy FOR SELECT TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft() AND (network_account_id IS NULL OR network_account_id = mesh.current_network_account_id_soft()));
CREATE POLICY delivery_policy_account_write ON control.delivery_policy FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft() AND network_account_id = mesh.current_network_account_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id() AND network_account_id = mesh.current_network_account_id_soft());
CREATE POLICY delivery_policy_seed_write ON control.delivery_policy FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
