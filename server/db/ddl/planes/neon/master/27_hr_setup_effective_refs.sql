-- Explicit, effective company applicability for tenant organization units.
CREATE TABLE master.hr_org_company_assignment (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  org_unit_id uuid NOT NULL, company_code_id uuid NOT NULL,
  effective_from date NOT NULL, effective_until date,
  status text NOT NULL DEFAULT 'draft', row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  approved_at timestamptz, approved_by uuid,
  CONSTRAINT hr_org_company_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT hr_org_company_org_fk FOREIGN KEY(tenant_id,org_unit_id) REFERENCES master.org_unit(tenant_id,id),
  CONSTRAINT hr_org_company_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id),
  CONSTRAINT hr_org_company_dates_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT hr_org_company_status_chk CHECK(status IN('draft','active','retired')),
  CONSTRAINT hr_org_company_review_chk CHECK((status='draft' AND approved_at IS NULL AND approved_by IS NULL) OR (status IN('active','retired') AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>created_by)),
  CONSTRAINT hr_org_company_version_chk CHECK(row_version>0)
);
ALTER TABLE master.hr_org_company_assignment ADD CONSTRAINT hr_org_company_no_overlap
  EXCLUDE USING gist (tenant_id WITH =,org_unit_id WITH =,company_code_id WITH =,daterange(effective_from,effective_until,'[)') WITH &&) WHERE(status='active');
CREATE INDEX hr_org_company_current_idx ON master.hr_org_company_assignment(tenant_id,company_code_id,effective_from DESC) WHERE status='active';
ALTER TABLE master.hr_org_company_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.hr_org_company_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.hr_org_company_assignment FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON master.hr_org_company_assignment FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON master.hr_org_company_assignment TO athyperapp;

-- A reviewed append-only change for future calendar days. Publication inserts
-- the canonical day once; current and historical days are never overwritten.
CREATE TABLE master.hr_calendar_day_change (
  id uuid PRIMARY KEY DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  holiday_calendar_id uuid NOT NULL, company_code_id uuid NOT NULL,
  holiday_date date NOT NULL, name text NOT NULL,
  day_type text NOT NULL DEFAULT 'HOLIDAY', observance_type text NOT NULL DEFAULT 'MANDATORY',
  is_half_day boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft', row_version bigint NOT NULL DEFAULT 1,
  applied_day_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  approved_at timestamptz, approved_by uuid,
  CONSTRAINT hr_calendar_day_change_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT hr_calendar_day_change_calendar_fk FOREIGN KEY(tenant_id,holiday_calendar_id) REFERENCES master.holiday_calendar(tenant_id,id),
  CONSTRAINT hr_calendar_day_change_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id),
  CONSTRAINT hr_calendar_day_change_applied_fk FOREIGN KEY(tenant_id,applied_day_id) REFERENCES master.holiday_calendar_day(tenant_id,id),
  CONSTRAINT hr_calendar_day_change_name_chk CHECK(btrim(name)<>'' AND length(name)<=256),
  CONSTRAINT hr_calendar_day_change_type_chk CHECK(day_type IN('HOLIDAY','WORKING_OVERRIDE','BLACKOUT') AND observance_type IN('MANDATORY','OPTIONAL','INFORMATIONAL')),
  CONSTRAINT hr_calendar_day_change_status_chk CHECK(status IN('draft','published')),
  CONSTRAINT hr_calendar_day_change_review_chk CHECK((status='draft' AND approved_at IS NULL AND approved_by IS NULL AND applied_day_id IS NULL) OR (status='published' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>created_by AND applied_day_id IS NOT NULL)),
  CONSTRAINT hr_calendar_day_change_version_chk CHECK(row_version>0)
);
CREATE UNIQUE INDEX hr_calendar_day_change_one_draft ON master.hr_calendar_day_change(tenant_id,holiday_calendar_id,holiday_date) WHERE status='draft';
ALTER TABLE master.hr_calendar_day_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.hr_calendar_day_change FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON master.hr_calendar_day_change FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
REVOKE ALL ON master.hr_calendar_day_change FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON master.hr_calendar_day_change TO athyperapp;
