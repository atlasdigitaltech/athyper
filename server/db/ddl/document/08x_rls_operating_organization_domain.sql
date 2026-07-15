-- ============================================================================
-- RLS for Operating Organization domain ownership and allocations
-- ============================================================================

ALTER TABLE document.operating_organization_resource_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.operating_organization_resource_owner FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON document.operating_organization_resource_owner;
DROP POLICY IF EXISTS tenant_insert ON document.operating_organization_resource_owner;
DROP POLICY IF EXISTS tenant_update ON document.operating_organization_resource_owner;
DROP POLICY IF EXISTS tenant_delete ON document.operating_organization_resource_owner;
DROP POLICY IF EXISTS admin_read ON document.operating_organization_resource_owner;
DROP POLICY IF EXISTS admin_write ON document.operating_organization_resource_owner;

CREATE POLICY tenant_read ON document.operating_organization_resource_owner FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL
       AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.operating_organization_resource_owner FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.operating_organization_resource_owner FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.operating_organization_resource_owner FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON document.operating_organization_resource_owner FOR SELECT TO athyperadmin
    USING (true);
CREATE POLICY admin_write ON document.operating_organization_resource_owner FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);

ALTER TABLE document.operating_organization_resource_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.operating_organization_resource_company FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON document.operating_organization_resource_company;
DROP POLICY IF EXISTS tenant_insert ON document.operating_organization_resource_company;
DROP POLICY IF EXISTS tenant_update ON document.operating_organization_resource_company;
DROP POLICY IF EXISTS tenant_delete ON document.operating_organization_resource_company;
DROP POLICY IF EXISTS admin_read ON document.operating_organization_resource_company;
DROP POLICY IF EXISTS admin_write ON document.operating_organization_resource_company;

CREATE POLICY tenant_read ON document.operating_organization_resource_company FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL
       AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.operating_organization_resource_company FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON document.operating_organization_resource_company FOR UPDATE
    USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON document.operating_organization_resource_company FOR DELETE
    USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON document.operating_organization_resource_company FOR SELECT TO athyperadmin
    USING (true);
CREATE POLICY admin_write ON document.operating_organization_resource_company FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);
