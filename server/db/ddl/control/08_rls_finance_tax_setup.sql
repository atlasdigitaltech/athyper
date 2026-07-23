ALTER TABLE control.tax_group_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.tax_group_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON control.tax_group_version;
DROP POLICY IF EXISTS tenant_insert ON control.tax_group_version;
DROP POLICY IF EXISTS tenant_update ON control.tax_group_version;
DROP POLICY IF EXISTS tenant_delete ON control.tax_group_version;
DROP POLICY IF EXISTS admin_read ON control.tax_group_version;
DROP POLICY IF EXISTS admin_write ON control.tax_group_version;
CREATE POLICY tenant_read ON control.tax_group_version FOR SELECT USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.tax_group_version FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_update ON control.tax_group_version FOR UPDATE USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.tax_group_version FOR DELETE USING (tenant_id=shared.current_tenant_id());
CREATE POLICY admin_read ON control.tax_group_version FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.tax_group_version FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

