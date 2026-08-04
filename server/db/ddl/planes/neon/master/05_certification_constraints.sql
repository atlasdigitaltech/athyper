ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_pkey PRIMARY KEY (id);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_code_fmt_chk
  CHECK (code ~ '^[a-z][a-z0-9_-]*$'::text);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_custom_tenant_chk
  CHECK (NOT is_custom OR tenant_id IS NOT NULL);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_name_nonempty_chk
  CHECK (btrim(name) <> ''::text);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_status_chk
  CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text]));
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_metadata_object_chk
  CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE ONLY master.certification_type
  ADD CONSTRAINT certification_type_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_pkey PRIMARY KEY (id);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_tenant_id_uq UNIQUE (tenant_id, id);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_owner_nonempty_chk
  CHECK (btrim(owner_type) <> ''::text);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_status_chk
  CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text, 'superseded'::text]));
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_type_xor_custom_chk
  CHECK (
    certification_type_id IS NOT NULL AND custom_name IS NULL
    OR certification_type_id IS NULL AND custom_name IS NOT NULL
  );
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_validity_order_chk
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_metadata_object_chk
  CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_type_fk
  FOREIGN KEY (certification_type_id)
  REFERENCES master.certification_type(id)
  ON DELETE RESTRICT;
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_company_code_fk
  FOREIGN KEY (tenant_id, company_code_id)
  REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY master.certification
  ADD CONSTRAINT certification_site_fk
  FOREIGN KEY (tenant_id, site_id)
  REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT;
