-- ============================================================================
-- master/04_people_indexes.sql
-- ============================================================================

CREATE INDEX IF NOT EXISTS employee_person_idx ON master.employee (tenant_id, person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS person_email_idx ON master.person (tenant_id, primary_email) WHERE primary_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS person_name_fts_idx
    ON master.person USING gin(to_tsvector('simple',
        coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(preferred_name, '')
    ));
CREATE INDEX IF NOT EXISTS external_reference_owner_idx ON master.external_reference (tenant_id, owner_entity, owner_id);
CREATE INDEX IF NOT EXISTS org_unit_parent_idx ON master.org_unit (tenant_id, parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_unit_company_idx ON master.org_unit (tenant_id, company_code_id) WHERE company_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_unit_path_idx ON master.org_unit (tenant_id, path) WHERE path IS NOT NULL;
CREATE INDEX IF NOT EXISTS position_org_unit_idx ON master.position (tenant_id, org_unit_id) WHERE org_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS position_job_idx ON master.position (tenant_id, job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS position_name_fts_idx
    ON master.position USING gin(to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(code, '')));
CREATE INDEX IF NOT EXISTS employment_person_idx ON master.employment (tenant_id, person_id);
CREATE INDEX IF NOT EXISTS employment_employee_idx ON master.employment (tenant_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employment_one_active_fulltime_per_company_uq
    ON master.employment (tenant_id, person_id, company_code_id)
    WHERE status = 'active' AND employment_type = 'full_time';
CREATE INDEX IF NOT EXISTS work_assignment_employee_idx ON master.work_assignment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS work_assignment_position_idx ON master.work_assignment (tenant_id, position_id) WHERE position_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leave_enrollment_employee_idx ON master.employee_leave_enrollment (tenant_id, employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS pay_group_company_idx ON master.pay_group (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS pay_component_type_idx ON master.pay_component (tenant_id, component_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS pay_structure_one_active_per_group_uq
    ON master.pay_structure (tenant_id, pay_group_id, effective_from)
    WHERE status = 'active' AND pay_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS statutory_scheme_country_idx ON master.statutory_scheme (tenant_id, country_code, scheme_type);
