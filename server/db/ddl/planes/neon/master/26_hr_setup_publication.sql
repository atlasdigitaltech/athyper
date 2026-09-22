-- Approval receipt for new HR setup records. The source record remains draft
-- until another authorized principal publishes it in the same transaction.
CREATE TABLE master.hr_setup_publication (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
  tenant_id uuid NOT NULL,
  entity_kind text NOT NULL,
  entity_id uuid NOT NULL,
  company_code_id uuid,
  status text NOT NULL DEFAULT 'draft',
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  CONSTRAINT hr_setup_publication_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT hr_setup_publication_entity_uq UNIQUE(tenant_id,entity_kind,entity_id),
  CONSTRAINT hr_setup_publication_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id),
  CONSTRAINT hr_setup_publication_kind_chk CHECK(entity_kind IN('job_family','job_function','pay_grade','job','position','site','holiday_calendar')),
  CONSTRAINT hr_setup_publication_scope_chk CHECK((entity_kind IN('position','site','holiday_calendar'))=(company_code_id IS NOT NULL)),
  CONSTRAINT hr_setup_publication_status_chk CHECK(status IN('draft','published')),
  CONSTRAINT hr_setup_publication_review_chk CHECK((status='draft' AND approved_at IS NULL AND approved_by IS NULL) OR (status='published' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>created_by)),
  CONSTRAINT hr_setup_publication_version_chk CHECK(row_version>0)
);
CREATE INDEX hr_setup_publication_queue_idx ON master.hr_setup_publication(tenant_id,company_code_id,created_at DESC) WHERE status='draft';
ALTER TABLE master.hr_setup_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.hr_setup_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.hr_setup_publication FOR ALL
  USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON master.hr_setup_publication FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON master.hr_setup_publication TO athyperapp;
