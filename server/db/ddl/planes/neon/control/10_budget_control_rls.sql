ALTER TABLE control.budget_control_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.budget_control_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY budget_control_policy_tenant_access
    ON control.budget_control_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY budget_control_policy_seed_write
    ON control.budget_control_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
