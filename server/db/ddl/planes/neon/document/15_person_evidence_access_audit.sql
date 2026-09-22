-- Purpose-bound audit evidence for restricted Employee 360 reads.
CREATE TABLE document.person_sensitive_access_audit (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  person_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  purpose_code text NOT NULL,
  requested_fields text[] NOT NULL,
  disclosed_fields text[] NOT NULL,
  redacted_fields text[] NOT NULL,
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT person_sensitive_access_audit_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_sensitive_access_audit_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_sensitive_access_audit_principal_fk FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_sensitive_access_audit_purpose_chk CHECK(purpose_code IN('employment','payroll','benefits','compliance','health')),
  CONSTRAINT person_sensitive_access_audit_fields_chk CHECK(cardinality(requested_fields) BETWEEN 1 AND 20 AND disclosed_fields<@requested_fields AND redacted_fields<@requested_fields),
  CONSTRAINT person_sensitive_access_audit_expiry_chk CHECK(expires_at>occurred_at)
);
CREATE INDEX person_sensitive_access_audit_person_idx ON document.person_sensitive_access_audit(tenant_id,person_id,occurred_at DESC);
ALTER TABLE document.person_sensitive_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.person_sensitive_access_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.person_sensitive_access_audit FOR SELECT
  USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_append ON document.person_sensitive_access_audit FOR INSERT
  WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON document.person_sensitive_access_audit FROM PUBLIC;
GRANT SELECT,INSERT ON document.person_sensitive_access_audit TO athyperapp;
