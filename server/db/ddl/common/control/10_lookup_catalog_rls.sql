ALTER TABLE control.lookup_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_domain FORCE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_value FORCE ROW LEVEL SECURITY;

CREATE POLICY lookup_domain_read ON control.lookup_domain
  FOR SELECT USING (true);
CREATE POLICY lookup_domain_admin ON control.lookup_domain
  FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY lookup_domain_seed ON control.lookup_domain
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY lookup_value_read ON control.lookup_value
  FOR SELECT USING (
    tenant_id IS NULL
    OR (
      shared.current_tenant_id_soft() IS NOT NULL
      AND tenant_id = shared.current_tenant_id_soft()
    )
  );
CREATE POLICY lookup_value_tenant_insert ON control.lookup_value
  FOR INSERT WITH CHECK (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  );
CREATE POLICY lookup_value_tenant_update ON control.lookup_value
  FOR UPDATE USING (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  ) WITH CHECK (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  );
CREATE POLICY lookup_value_tenant_delete ON control.lookup_value
  FOR DELETE USING (
    tenant_id = shared.current_tenant_id()
    AND NOT is_system
  );
CREATE POLICY lookup_value_admin ON control.lookup_value
  FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY lookup_value_seed ON control.lookup_value
  FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
