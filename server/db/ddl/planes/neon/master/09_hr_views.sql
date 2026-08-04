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
     ORDER BY
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
     ORDER BY
       (x.assignment_type = 'primary' AND x.status = 'active') DESC,
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
  'Compatibility employee projection. Person, employment, and work_assignment values override deprecated flattened employee columns; base-table RLS remains enforced.';
