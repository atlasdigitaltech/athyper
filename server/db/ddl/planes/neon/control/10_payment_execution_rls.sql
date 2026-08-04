ALTER TABLE control.payment_execution_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.payment_execution_profile FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_execution_profile_tenant_access
    ON control.payment_execution_profile FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY payment_execution_profile_seed_write
    ON control.payment_execution_profile FOR ALL TO CURRENT_USER
    USING (true) WITH CHECK (true);
