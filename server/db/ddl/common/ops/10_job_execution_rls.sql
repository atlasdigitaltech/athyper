ALTER TABLE ops.job_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.job_execution FORCE ROW LEVEL SECURITY;

CREATE POLICY job_execution_admin_access ON ops.job_execution
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY job_execution_tenant_access ON ops.job_execution
    FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
