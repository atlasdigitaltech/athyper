-- Tenant isolation for legal-hold registry rows.

ALTER TABLE governance.legal_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.legal_hold FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON governance.legal_hold;
DROP POLICY IF EXISTS tenant_insert ON governance.legal_hold;
DROP POLICY IF EXISTS tenant_update ON governance.legal_hold;
DROP POLICY IF EXISTS tenant_delete ON governance.legal_hold;
DROP POLICY IF EXISTS admin_read ON governance.legal_hold;
DROP POLICY IF EXISTS admin_write ON governance.legal_hold;

CREATE POLICY tenant_read ON governance.legal_hold
    FOR SELECT USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY tenant_insert ON governance.legal_hold
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON governance.legal_hold
    FOR UPDATE USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON governance.legal_hold
    FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON governance.legal_hold
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON governance.legal_hold
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
