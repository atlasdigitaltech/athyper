ALTER TABLE control.commodity_code_classification_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.commodity_code_classification_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY commodity_code_classification_policy_tenant_access
    ON control.commodity_code_classification_policy FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY commodity_code_classification_policy_seed_write
    ON control.commodity_code_classification_policy FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
