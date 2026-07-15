-- Tenant isolation for per-tenant content quota configuration.

ALTER TABLE control.content_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.content_quota FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON control.content_quota;
DROP POLICY IF EXISTS tenant_insert ON control.content_quota;
DROP POLICY IF EXISTS tenant_update ON control.content_quota;
DROP POLICY IF EXISTS tenant_delete ON control.content_quota;
DROP POLICY IF EXISTS admin_read ON control.content_quota;
DROP POLICY IF EXISTS admin_write ON control.content_quota;

CREATE POLICY tenant_read ON control.content_quota
    FOR SELECT USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY tenant_insert ON control.content_quota
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.content_quota
    FOR UPDATE USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.content_quota
    FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON control.content_quota
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.content_quota
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
