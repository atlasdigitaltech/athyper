ALTER TABLE control.workflow_sla_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.workflow_sla_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE control.bank_format_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.bank_format_rule FORCE ROW LEVEL SECURITY;

CREATE POLICY workflow_sla_policy_admin_access ON control.workflow_sla_policy
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY workflow_sla_policy_tenant_read ON control.workflow_sla_policy
    FOR SELECT TO athyperapp
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY bank_format_rule_admin_access ON control.bank_format_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY bank_format_rule_tenant_read ON control.bank_format_rule
    FOR SELECT TO athyperapp
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
