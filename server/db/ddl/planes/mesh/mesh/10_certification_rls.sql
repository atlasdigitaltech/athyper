ALTER TABLE mesh.certification_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification_type FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.certification FORCE ROW LEVEL SECURITY;

CREATE POLICY mesh_certification_type_admin
  ON mesh.certification_type FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY mesh_certification_type_read
  ON mesh.certification_type FOR SELECT TO PUBLIC
  USING (
    tenant_id IS NULL
    OR (
      shared.current_tenant_id_soft() IS NOT NULL
      AND tenant_id = shared.current_tenant_id_soft()
    )
  );
CREATE POLICY mesh_certification_type_write
  ON mesh.certification_type FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY mesh_certification_admin
  ON mesh.certification FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);
CREATE POLICY mesh_certification_read
  ON mesh.certification FOR SELECT TO PUBLIC
  USING (
    shared.current_tenant_id_soft() IS NOT NULL
    AND tenant_id = shared.current_tenant_id_soft()
  );
CREATE POLICY mesh_certification_write
  ON mesh.certification FOR ALL TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());
