ALTER TABLE ledger.book_period_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.book_period_status FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON ledger.book_period_status
    FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY seed_write ON ledger.book_period_status
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
