-- Tenant isolation for CMS content registry rows.

ALTER TABLE master.content_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.content_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON master.content_item;
DROP POLICY IF EXISTS tenant_insert ON master.content_item;
DROP POLICY IF EXISTS tenant_update ON master.content_item;
DROP POLICY IF EXISTS tenant_delete ON master.content_item;
DROP POLICY IF EXISTS admin_read ON master.content_item;
DROP POLICY IF EXISTS admin_write ON master.content_item;

CREATE POLICY tenant_read ON master.content_item
    FOR SELECT USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY tenant_insert ON master.content_item
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.content_item
    FOR UPDATE USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.content_item
    FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON master.content_item
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.content_item
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
