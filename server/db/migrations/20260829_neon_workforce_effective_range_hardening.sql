BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon'
     OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Workforce effective-range hardening requires the NEON plane';
  END IF;
END $$;

-- Inventory first and fail closed. No row is modified until every currently
-- representable workforce contract is compatible and has a valid half-open range.
DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM master.employment employment
  JOIN master.company_code company ON company.tenant_id=employment.tenant_id AND company.id=employment.company_code_id
  WHERE company.legal_entity_id IS DISTINCT FROM employment.legal_entity_id;
  IF v_count<>0 THEN RAISE EXCEPTION 'Employment company/legal-entity mismatches: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM master.employment employment
  JOIN master.employee employee ON employee.tenant_id=employment.tenant_id AND employee.id=employment.employee_id
  WHERE employment.employee_id IS NOT NULL AND employee.person_id IS DISTINCT FROM employment.person_id;
  IF v_count<>0 THEN RAISE EXCEPTION 'Employment employee/person mismatches: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM master.work_assignment assignment
  JOIN master.employment employment ON employment.tenant_id=assignment.tenant_id AND employment.id=assignment.employment_id
  WHERE assignment.employment_id IS NOT NULL
    AND (employment.employee_id IS DISTINCT FROM assignment.employee_id OR employment.company_code_id IS DISTINCT FROM assignment.company_code_id);
  IF v_count<>0 THEN RAISE EXCEPTION 'Work-assignment employment contract mismatches: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM master.employment WHERE termination_date IS NOT NULL AND termination_date<=hire_date;
  IF v_count<>0 THEN RAISE EXCEPTION 'Employment ranges are not valid [from, until) ranges: %',v_count; END IF;
  SELECT count(*) INTO v_count FROM master.work_assignment WHERE effective_until IS NOT NULL AND effective_until<=effective_from;
  IF v_count<>0 THEN RAISE EXCEPTION 'Work-assignment ranges are not valid [from, until) ranges: %',v_count; END IF;
END $$;

ALTER TABLE master.employment ADD COLUMN is_primary boolean NOT NULL DEFAULT true;

DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM master.employment left_row
  JOIN master.employment right_row ON right_row.tenant_id=left_row.tenant_id AND right_row.person_id=left_row.person_id AND right_row.id>left_row.id
   AND right_row.status='active' AND right_row.employment_status IN('active','suspended')
   AND daterange(right_row.hire_date,COALESCE(right_row.termination_date,'infinity'::date),'[)') && daterange(left_row.hire_date,COALESCE(left_row.termination_date,'infinity'::date),'[)')
  WHERE left_row.is_primary AND right_row.is_primary AND left_row.status='active' AND left_row.employment_status IN('active','suspended');
  IF v_count<>0 THEN RAISE EXCEPTION 'Overlapping active primary employments: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM master.work_assignment left_row
  JOIN master.work_assignment right_row ON right_row.tenant_id=left_row.tenant_id AND right_row.employee_id=left_row.employee_id AND right_row.id>left_row.id
   AND right_row.assignment_type='primary' AND right_row.status='active'
   AND daterange(right_row.effective_from,COALESCE(right_row.effective_until,'infinity'::date),'[)') && daterange(left_row.effective_from,COALESCE(left_row.effective_until,'infinity'::date),'[)')
  WHERE left_row.assignment_type='primary' AND left_row.status='active';
  IF v_count<>0 THEN RAISE EXCEPTION 'Overlapping active primary work assignments: %',v_count; END IF;
END $$;

ALTER TABLE master.employment DROP CONSTRAINT employment_dates_chk;
ALTER TABLE master.employment ADD CONSTRAINT employment_dates_chk CHECK(
  (service_date IS NULL OR service_date<=hire_date)
  AND (probation_end_date IS NULL OR probation_end_date>=hire_date)
  AND (termination_date IS NULL OR termination_date>hire_date)) NOT VALID;
ALTER TABLE master.employment VALIDATE CONSTRAINT employment_dates_chk;
ALTER TABLE master.work_assignment DROP CONSTRAINT work_assignment_effective_chk;
ALTER TABLE master.work_assignment ADD CONSTRAINT work_assignment_effective_chk CHECK(effective_until IS NULL OR effective_until>effective_from) NOT VALID;
ALTER TABLE master.work_assignment VALIDATE CONSTRAINT work_assignment_effective_chk;

ALTER TABLE master.employee ADD CONSTRAINT employee_contract_identity_uq UNIQUE(tenant_id,id,person_id);
ALTER TABLE master.employment ADD CONSTRAINT employment_assignment_identity_uq UNIQUE(tenant_id,id,employee_id,company_code_id);
ALTER TABLE master.employment
  ADD CONSTRAINT employment_employee_person_fk FOREIGN KEY(tenant_id,employee_id,person_id) REFERENCES master.employee(tenant_id,id,person_id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT employment_company_legal_entity_fk FOREIGN KEY(tenant_id,company_code_id,legal_entity_id) REFERENCES master.company_code(tenant_id,id,legal_entity_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE master.employment VALIDATE CONSTRAINT employment_employee_person_fk;
ALTER TABLE master.employment VALIDATE CONSTRAINT employment_company_legal_entity_fk;
ALTER TABLE master.work_assignment ADD CONSTRAINT work_assignment_employment_contract_fk FOREIGN KEY(tenant_id,employment_id,employee_id,company_code_id) REFERENCES master.employment(tenant_id,id,employee_id,company_code_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE master.work_assignment VALIDATE CONSTRAINT work_assignment_employment_contract_fk;

DROP INDEX master.employment_one_active_fulltime_per_company_uq;
DROP INDEX master.work_assignment_one_primary_active_uq;
ALTER TABLE master.employment ADD CONSTRAINT employment_primary_effective_no_overlap EXCLUDE USING gist(
  tenant_id WITH =,person_id WITH =,daterange(hire_date,COALESCE(termination_date,'infinity'::date),'[)') WITH &&)
  WHERE(is_primary AND status='active' AND employment_status IN('active','suspended'));
ALTER TABLE master.work_assignment ADD CONSTRAINT work_assignment_primary_effective_no_overlap EXCLUDE USING gist(
  tenant_id WITH =,employee_id WITH =,daterange(effective_from,COALESCE(effective_until,'infinity'::date),'[)') WITH &&)
  WHERE(assignment_type='primary' AND status='active');

CREATE OR REPLACE FUNCTION master.trg_validate_employment_contract() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM master.company_code company WHERE company.tenant_id=NEW.tenant_id AND company.id=NEW.company_code_id AND company.legal_entity_id=NEW.legal_entity_id) THEN RAISE EXCEPTION 'Employment company code does not belong to its legal entity' USING ERRCODE='integrity_constraint_violation'; END IF;
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.employee employee WHERE employee.tenant_id=NEW.tenant_id AND employee.id=NEW.employee_id AND employee.person_id=NEW.person_id) THEN RAISE EXCEPTION 'Employment employee does not belong to its person' USING ERRCODE='integrity_constraint_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_employment_contract BEFORE INSERT OR UPDATE OF tenant_id,person_id,employee_id,legal_entity_id,company_code_id ON master.employment FOR EACH ROW EXECUTE FUNCTION master.trg_validate_employment_contract();

COMMENT ON COLUMN master.employment.is_primary IS 'Exactly one active primary employment may cover a person on an applicable [hire_date, termination_date) range.';
COMMENT ON CONSTRAINT work_assignment_primary_effective_no_overlap ON master.work_assignment IS 'Prevents overlapping active primary assignments for one employee using [effective_from, effective_until) semantics.';

COMMIT;
