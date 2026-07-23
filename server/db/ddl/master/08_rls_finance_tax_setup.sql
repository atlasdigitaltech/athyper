ALTER TABLE master.organization_tax_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.organization_tax_registration FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON master.organization_tax_registration;
DROP POLICY IF EXISTS tenant_insert ON master.organization_tax_registration;
DROP POLICY IF EXISTS tenant_update ON master.organization_tax_registration;
DROP POLICY IF EXISTS tenant_delete ON master.organization_tax_registration;
DROP POLICY IF EXISTS admin_read ON master.organization_tax_registration;
DROP POLICY IF EXISTS admin_write ON master.organization_tax_registration;
CREATE POLICY tenant_read ON master.organization_tax_registration FOR SELECT USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.organization_tax_registration FOR INSERT WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_update ON master.organization_tax_registration FOR UPDATE USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.organization_tax_registration FOR DELETE USING (tenant_id=shared.current_tenant_id());
CREATE POLICY admin_read ON master.organization_tax_registration FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.organization_tax_registration FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

