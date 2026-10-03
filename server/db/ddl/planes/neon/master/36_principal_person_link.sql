-- Retained data model only. The custom linkage workflow is no longer installed.
CREATE TABLE IF NOT EXISTS master.principal_person_link (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  person_id uuid NOT NULL,
  record_version bigint NOT NULL DEFAULT 1 CHECK(record_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz,
  updated_by uuid,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,principal_id),
  UNIQUE(tenant_id,person_id),
  FOREIGN KEY(tenant_id,principal_id) REFERENCES master.principal(tenant_id,id),
  FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id),
  CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
ALTER TABLE master.principal_person_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_person_link FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS principal_person_link_tenant ON master.principal_person_link;
CREATE POLICY principal_person_link_tenant ON master.principal_person_link
  USING(tenant_id=shared.current_tenant_id_soft())
  WITH CHECK(tenant_id=shared.current_tenant_id());

-- Keep the retained table read-only to the application role.
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='athyperapp') THEN
    REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON master.principal_person_link FROM athyperapp;
    GRANT SELECT ON master.principal_person_link TO athyperapp;
  END IF;
END $$;
