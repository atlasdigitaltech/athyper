ALTER TABLE control.numbering_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.numbering_policy FORCE ROW LEVEL SECURITY;

CREATE POLICY numbering_policy_read ON control.numbering_policy
    FOR SELECT
    USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY numbering_policy_tenant_write ON control.numbering_policy
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY numbering_policy_seed_write ON control.numbering_policy
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
