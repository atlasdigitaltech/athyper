ALTER TABLE control.fx_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.fx_policy FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON control.fx_policy;
DROP POLICY IF EXISTS tenant_insert ON control.fx_policy;
DROP POLICY IF EXISTS tenant_update ON control.fx_policy;
DROP POLICY IF EXISTS tenant_delete ON control.fx_policy;
DROP POLICY IF EXISTS admin_read ON control.fx_policy;
DROP POLICY IF EXISTS admin_write ON control.fx_policy;

CREATE POLICY tenant_read ON control.fx_policy FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.fx_policy FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.fx_policy FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.fx_policy FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON control.fx_policy FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.fx_policy FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

