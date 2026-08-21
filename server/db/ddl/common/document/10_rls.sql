ALTER TABLE document.work_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.work_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.work_item
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON document.work_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
