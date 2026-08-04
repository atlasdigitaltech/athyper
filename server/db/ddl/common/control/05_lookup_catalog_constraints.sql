ALTER TABLE control.lookup_domain
  ADD CONSTRAINT lookup_domain_pkey PRIMARY KEY (id),
  ADD CONSTRAINT lookup_domain_code_uq UNIQUE (code),
  ADD CONSTRAINT lookup_domain_code_fmt_chk
    CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  ADD CONSTRAINT lookup_domain_name_nonempty_chk CHECK (btrim(name) <> ''),
  ADD CONSTRAINT lookup_domain_source_schema_fmt_chk
    CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'),
  ADD CONSTRAINT lookup_domain_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT lookup_domain_status_chk CHECK (status IN ('active', 'deprecated')),
  ADD CONSTRAINT lookup_domain_status_audit_pair_chk
    CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  ADD CONSTRAINT lookup_domain_audit_pair_chk
    CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE control.lookup_value
  ADD CONSTRAINT lookup_value_pkey PRIMARY KEY (id),
  ADD CONSTRAINT lookup_value_code_fmt_chk
    CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  ADD CONSTRAINT lookup_value_name_nonempty_chk CHECK (btrim(name) <> ''),
  ADD CONSTRAINT lookup_value_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT lookup_value_status_chk CHECK (status IN ('active', 'deprecated')),
  ADD CONSTRAINT lookup_value_status_audit_pair_chk
    CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  ADD CONSTRAINT lookup_value_audit_pair_chk
    CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
  ADD CONSTRAINT lookup_value_system_consistency_chk CHECK (
    (is_system AND tenant_id IS NULL)
    OR (NOT is_system AND tenant_id IS NOT NULL)
  ),
  ADD CONSTRAINT lookup_value_domain_fk
    FOREIGN KEY (domain_code) REFERENCES control.lookup_domain(code) ON DELETE RESTRICT,
  ADD CONSTRAINT lookup_value_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
