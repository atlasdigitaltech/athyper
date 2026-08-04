ALTER TABLE master.warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.warehouse FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_access ON master.warehouse
FOR ALL
USING (tenant_id = shared.current_tenant_id_soft())
WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY seed_write ON master.warehouse
FOR ALL TO CURRENT_USER
USING (true)
WITH CHECK (true);
