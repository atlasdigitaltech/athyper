ALTER TABLE mesh.certification_type
  ADD CONSTRAINT mesh_certification_type_pkey PRIMARY KEY (id),
  ADD CONSTRAINT mesh_certification_type_code_chk CHECK (code ~ '^[a-z][a-z0-9_-]*$'),
  ADD CONSTRAINT mesh_certification_type_name_chk CHECK (btrim(name) <> ''),
  ADD CONSTRAINT mesh_certification_type_status_chk CHECK (status IN ('active', 'deprecated')),
  ADD CONSTRAINT mesh_certification_type_custom_chk CHECK (NOT is_custom OR tenant_id IS NOT NULL),
  ADD CONSTRAINT mesh_certification_type_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT mesh_certification_type_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE mesh.certification
  ADD CONSTRAINT mesh_certification_pkey PRIMARY KEY (id),
  ADD CONSTRAINT mesh_certification_tenant_id_uq UNIQUE (tenant_id, id),
  ADD CONSTRAINT mesh_certification_owner_nonempty_chk CHECK (btrim(owner_type) <> ''),
  ADD CONSTRAINT mesh_certification_type_xor_chk CHECK (
    (certification_type_id IS NOT NULL AND custom_name IS NULL)
    OR (certification_type_id IS NULL AND custom_name IS NOT NULL)
  ),
  ADD CONSTRAINT mesh_certification_validity_chk CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
  ),
  ADD CONSTRAINT mesh_certification_status_chk
    CHECK (status IN ('active', 'expired', 'revoked', 'superseded')),
  ADD CONSTRAINT mesh_certification_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT mesh_certification_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
  ADD CONSTRAINT mesh_certification_type_fk
    FOREIGN KEY (certification_type_id) REFERENCES mesh.certification_type(id) ON DELETE RESTRICT;
