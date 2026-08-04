CREATE UNIQUE INDEX certification_type_scope_code_uq
  ON master.certification_type
  USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX certification_type_category_idx
  ON master.certification_type USING btree (category)
  WHERE category IS NOT NULL;
CREATE INDEX certification_type_tenant_idx
  ON master.certification_type USING btree (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX certification_expiry_idx
  ON master.certification USING btree (tenant_id, effective_until)
  WHERE effective_until IS NOT NULL AND status = 'active'::text;
CREATE INDEX certification_owner_idx
  ON master.certification USING btree (tenant_id, owner_type, owner_id);
CREATE INDEX certification_type_idx
  ON master.certification USING btree (tenant_id, certification_type_id)
  WHERE certification_type_id IS NOT NULL;
