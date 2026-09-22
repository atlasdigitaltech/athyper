-- Stage 0 Employee 360 baseline: repair current-person projection semantics.
-- Existing employee records are retained. This migration changes no row values.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(hashtextextended('20260922_workforce_as_of_projection', 0));

DO $$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Workforce as-of projection migration requires athyper_neon';
  END IF;
END
$$;

-- NULL means that a person number has not been allocated. It must not make
-- every later unnumbered person conflict with the first one in a tenant.
ALTER TABLE master.person DROP CONSTRAINT person_number_uq;
ALTER TABLE master.person
  ADD CONSTRAINT person_number_uq UNIQUE (tenant_id, person_number);

CREATE OR REPLACE VIEW master.v_employee
WITH (security_invoker = true, security_barrier = true) AS
SELECT
    e.id,
    e.tenant_id,
    e.code,
    e.name,
    e.principal_id,
    e.employee_number,
    p.first_name,
    p.last_name,
    COALESCE(p.display_name, p.name, e.display_name, e.name) AS display_name,
    COALESCE(p.primary_email, e.email) AS email,
    COALESCE(p.primary_phone, e.phone) AS phone,
    COALESCE(em.employment_type, e.employment_type) AS employment_type,
    COALESCE(ou.name, e.department) AS department,
    COALESCE(j.name, e.title) AS title,
    COALESCE(wa.manager_employee_id, e.manager_id) AS manager_id,
    COALESCE(em.company_code_id, wa.company_code_id, e.company_code_id) AS company_code_id,
    COALESCE(em.hire_date, e.hire_date) AS hire_date,
    COALESCE(em.termination_date, e.termination_date) AS termination_date,
    e.metadata,
    e.status,
    e.is_active,
    e.status_changed_at,
    e.status_changed_by,
    e.created_at,
    e.created_by,
    e.updated_at,
    e.updated_by,
    e.person_id,
    COALESCE(em.termination_date, e.termination_date) IS NOT NULL
        AND COALESCE(em.termination_date, e.termination_date) <= CURRENT_DATE
        AS is_terminated,
    CASE
        WHEN COALESCE(em.termination_date, e.termination_date) IS NOT NULL
             AND COALESCE(em.termination_date, e.termination_date) <= CURRENT_DATE
            THEN 'terminated'
        WHEN COALESCE(em.hire_date, e.hire_date) > CURRENT_DATE
            THEN 'future'
        WHEN COALESCE(em.employment_status, e.status) = 'suspended'
            THEN 'suspended'
        ELSE 'employed'
    END AS employment_status
FROM master.employee e
JOIN master.person p
  ON p.tenant_id = e.tenant_id
 AND p.id = e.person_id
LEFT JOIN LATERAL (
    SELECT x.*
      FROM master.employment x
     WHERE x.tenant_id = e.tenant_id
       AND (x.employee_id = e.id OR (x.employee_id IS NULL AND x.person_id = e.person_id))
       AND x.status = 'active'
       AND x.employment_status IN ('active', 'suspended')
       AND x.hire_date <= CURRENT_DATE
       AND (x.termination_date IS NULL OR x.termination_date > CURRENT_DATE)
     ORDER BY
       x.is_primary DESC,
       (x.employment_status = 'active') DESC,
       x.hire_date DESC,
       x.id
     LIMIT 1
) em ON true
LEFT JOIN LATERAL (
    SELECT x.*
      FROM master.work_assignment x
     WHERE x.tenant_id = e.tenant_id
       AND x.employee_id = e.id
       AND x.employment_id = em.id
       AND x.status = 'active'
       AND x.effective_from <= CURRENT_DATE
       AND (x.effective_until IS NULL OR x.effective_until > CURRENT_DATE)
     ORDER BY
       (x.assignment_type = 'primary') DESC,
       x.effective_from DESC,
       x.id
     LIMIT 1
) wa ON true
LEFT JOIN master.org_unit ou
  ON ou.tenant_id = wa.tenant_id
 AND ou.id = wa.org_unit_id
LEFT JOIN master.job j
  ON j.tenant_id = wa.tenant_id
 AND j.id = wa.job_id;

COMMENT ON VIEW master.v_employee IS
  'Compatibility employee projection. Person, current effective employment, and current effective work_assignment values override deprecated flattened employee columns; base-table RLS remains enforced.';

COMMIT;
