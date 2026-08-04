ALTER TABLE master.certification_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.certification_type FORCE ROW LEVEL SECURITY;
ALTER TABLE master.certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.certification FORCE ROW LEVEL SECURITY;

CREATE POLICY certification_type_admin_write
  ON master.certification_type
  FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY certification_type_tenant_read
  ON master.certification_type
  FOR SELECT TO PUBLIC
  USING (
    tenant_id IS NULL
    OR (
      shared.current_tenant_id_soft() IS NOT NULL
      AND tenant_id = shared.current_tenant_id_soft()
    )
  );
CREATE POLICY certification_type_tenant_write
  ON master.certification_type
  FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY certification_admin_write
  ON master.certification
  FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY certification_tenant_read
  ON master.certification
  FOR SELECT TO PUBLIC
  USING (
    shared.current_tenant_id_soft() IS NOT NULL
    AND tenant_id = shared.current_tenant_id_soft()
  );
CREATE POLICY certification_tenant_write
  ON master.certification
  FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());
