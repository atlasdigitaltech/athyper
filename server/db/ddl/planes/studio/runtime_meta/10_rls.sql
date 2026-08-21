ALTER TABLE runtime_meta.mfa_credential_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_meta.mfa_credential_projection FORCE ROW LEVEL SECURITY;

CREATE POLICY mfa_credential_projection_admin_access
    ON runtime_meta.mfa_credential_projection
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY mfa_credential_projection_tenant_access
    ON runtime_meta.mfa_credential_projection
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
