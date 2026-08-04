ALTER TABLE control.policy_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE control.policy_test_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.policy_test_case FORCE ROW LEVEL SECURITY;

CREATE POLICY policy_rule_admin_access ON control.policy_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY policy_rule_tenant_read ON control.policy_rule
    FOR SELECT TO athyperapp
    USING (EXISTS (
        SELECT 1 FROM control.policy_definition definition
         WHERE definition.id = policy_definition_id
           AND (definition.tenant_id IS NULL
                OR definition.tenant_id = shared.current_tenant_id_soft())
    ));

CREATE POLICY policy_test_case_admin_access ON control.policy_test_case
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY policy_test_case_tenant_read ON control.policy_test_case
    FOR SELECT TO athyperapp
    USING (EXISTS (
        SELECT 1 FROM control.policy_definition definition
         WHERE definition.id = policy_definition_id
           AND (definition.tenant_id IS NULL
                OR definition.tenant_id = shared.current_tenant_id_soft())
    ));
