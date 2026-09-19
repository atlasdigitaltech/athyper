-- Development-only support tables. Apply only through the guarded local installer.
CREATE TABLE master.local_contact_challenge (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES master.tenant(id),
  principal_id uuid NOT NULL, contact_id uuid NOT NULL, value text NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (tenant_id,contact_id) REFERENCES master.contact_link(tenant_id,id),
  FOREIGN KEY (tenant_id,principal_id) REFERENCES master.principal(tenant_id,id)
);
CREATE INDEX local_contact_challenge_expiry_idx ON master.local_contact_challenge(expires_at);
CREATE TABLE master.local_contact_challenge_limit (
  tenant_id uuid NOT NULL REFERENCES master.tenant(id), principal_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('request','complete')),
  window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0),
  PRIMARY KEY (tenant_id,principal_id,operation)
);
ALTER TABLE master.local_contact_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.local_contact_challenge FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.local_contact_challenge USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
ALTER TABLE master.local_contact_challenge_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.local_contact_challenge_limit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.local_contact_challenge_limit USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
