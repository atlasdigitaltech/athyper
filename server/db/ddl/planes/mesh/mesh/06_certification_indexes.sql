CREATE UNIQUE INDEX mesh_certification_type_scope_code_uq
  ON mesh.certification_type
  (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX mesh_certification_type_category_idx
  ON mesh.certification_type(category) WHERE category IS NOT NULL;
CREATE INDEX mesh_certification_type_tenant_idx
  ON mesh.certification_type(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX mesh_certification_owner_idx
  ON mesh.certification(tenant_id, owner_type, owner_id);
CREATE INDEX mesh_certification_type_idx
  ON mesh.certification(tenant_id, certification_type_id)
  WHERE certification_type_id IS NOT NULL;
CREATE INDEX mesh_certification_expiry_idx
  ON mesh.certification(tenant_id, effective_until)
  WHERE effective_until IS NOT NULL AND status = 'active';
