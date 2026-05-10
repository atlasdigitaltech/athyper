-- ============================================================================
-- master/05_people_functions.sql
-- Concept: People migration helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION master.backfill_people_from_employee(p_tenant_id uuid)
RETURNS TABLE (
    persons_created integer,
    employees_linked integer,
    employments_created integer,
    assignments_created integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_missing_hire_date_count integer := 0;
    v_employment_type_coerced_count integer := 0;
BEGIN
    -- Backfilled work assignments are intentionally skeletal. A later enrichment
    -- pass should map legacy department/title values to org_unit/job/position.
    INSERT INTO master.person (
        tenant_id, code, name, person_number,
        first_name, last_name, display_name,
        primary_email, primary_phone, metadata, status, created_by
    )
    SELECT
        se.tenant_id,
        'P-' || se.employee_key,
        se.display_name_value,
        se.employee_key,
        se.first_name_value,
        se.last_name_value,
        se.display_name_value,
        se.email,
        se.phone,
        jsonb_build_object('source', 'master.employee', 'employee_id', se.id),
        CASE WHEN se.status = 'archived' THEN 'archived' ELSE 'active' END,
        COALESCE(se.created_by, v_su)
    FROM (
        SELECT
            e.*,
            COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text) AS employee_key,
            COALESCE(
                NULLIF(btrim(e.first_name), ''),
                NULLIF(btrim(split_part(COALESCE(e.name, ''), ' ', 1)), ''),
                NULLIF(btrim(e.name), ''),
                'Unknown'
            ) AS first_name_value,
            COALESCE(
                NULLIF(btrim(e.last_name), ''),
                NULLIF(btrim(split_part(COALESCE(e.name, ''), ' ', 2)), ''),
                'Unknown'
            ) AS last_name_value,
            COALESCE(
                NULLIF(btrim(e.display_name), ''),
                NULLIF(btrim(e.name), ''),
                NULLIF(btrim(e.employee_number), ''),
                NULLIF(btrim(e.code), ''),
                e.id::text
            ) AS display_name_value
        FROM master.employee e
        WHERE e.tenant_id = p_tenant_id
          AND e.person_id IS NULL
    ) se
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS persons_created = ROW_COUNT;

    UPDATE master.employee e
       SET person_id = p.id,
           updated_at = now(),
           updated_by = v_su
      FROM master.person p
     WHERE e.tenant_id = p_tenant_id
       AND p.tenant_id = e.tenant_id
       AND p.code = 'P-' || COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text)
       AND e.person_id IS DISTINCT FROM p.id;

    GET DIAGNOSTICS employees_linked = ROW_COUNT;

    SELECT
        count(*) FILTER (WHERE e.hire_date IS NULL),
        count(*) FILTER (
            WHERE e.employment_type IS NULL
               OR e.employment_type NOT IN ('full_time','part_time','contract','casual','intern','volunteer')
        )
      INTO v_missing_hire_date_count, v_employment_type_coerced_count
      FROM master.employee e
     WHERE e.tenant_id = p_tenant_id
       AND e.person_id IS NOT NULL
       AND e.company_code_id IS NOT NULL;

    INSERT INTO master.employment (
        tenant_id, code, name, person_id, employee_id,
        legal_entity_id, company_code_id, employment_number,
        employment_type, employment_status, hire_date,
        termination_date, status, created_by
    )
    SELECT
        se.tenant_id,
        'EMPLOY-' || se.employee_key,
        se.display_name_value || ' Employment',
        se.person_id,
        se.id,
        cc.legal_entity_id,
        se.company_code_id,
        se.employee_key,
        CASE
            WHEN se.employment_type IN ('full_time','part_time','contract','casual','intern','volunteer')
                THEN se.employment_type
            ELSE 'full_time'
        END,
        CASE WHEN se.termination_date IS NULL THEN 'active' ELSE 'terminated' END,
        COALESCE(
            se.hire_date,
            CASE
                WHEN se.termination_date IS NOT NULL AND se.termination_date < CURRENT_DATE
                    THEN se.termination_date
                ELSE CURRENT_DATE
            END
        ),
        se.termination_date,
        CASE WHEN se.termination_date IS NULL THEN 'active' ELSE 'terminated' END,
        COALESCE(se.created_by, v_su)
    FROM (
        SELECT
            e.*,
            COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text) AS employee_key,
            COALESCE(
                NULLIF(btrim(e.display_name), ''),
                NULLIF(btrim(e.name), ''),
                NULLIF(btrim(e.employee_number), ''),
                NULLIF(btrim(e.code), ''),
                e.id::text
            ) AS display_name_value
        FROM master.employee e
        WHERE e.tenant_id = p_tenant_id
          AND e.person_id IS NOT NULL
          AND e.company_code_id IS NOT NULL
    ) se
    JOIN master.company_code cc
      ON cc.tenant_id = se.tenant_id
     AND cc.id = se.company_code_id
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS employments_created = ROW_COUNT;

    IF v_missing_hire_date_count > 0 THEN
        RAISE NOTICE 'BACKFILL_NOTICE: % employee(s) had no hire_date; defaulted safely', v_missing_hire_date_count;
    END IF;

    IF v_employment_type_coerced_count > 0 THEN
        RAISE NOTICE 'BACKFILL_NOTICE: % employee(s) had unrecognized employment_type coerced to full_time', v_employment_type_coerced_count;
    END IF;

    INSERT INTO master.work_assignment (
        tenant_id, code, name, employee_id, employment_id,
        company_code_id, manager_employee_id, assignment_type,
        effective_from, effective_until, status, created_by
    )
    SELECT
        se.tenant_id,
        'ASSIGN-' || se.employee_key,
        COALESCE(NULLIF(btrim(se.title), ''), se.display_name_value, se.employee_key),
        se.id,
        em.id,
        se.company_code_id,
        se.manager_id,
        'primary',
        COALESCE(
            se.hire_date,
            CASE
                WHEN se.termination_date IS NOT NULL AND se.termination_date < CURRENT_DATE
                    THEN se.termination_date
                ELSE CURRENT_DATE
            END
        ),
        se.termination_date,
        CASE WHEN se.termination_date IS NULL THEN 'active' ELSE 'ended' END,
        COALESCE(se.created_by, v_su)
    FROM (
        SELECT
            e.*,
            COALESCE(NULLIF(btrim(e.employee_number), ''), NULLIF(btrim(e.code), ''), e.id::text) AS employee_key,
            COALESCE(
                NULLIF(btrim(e.display_name), ''),
                NULLIF(btrim(e.name), ''),
                NULLIF(btrim(e.employee_number), ''),
                NULLIF(btrim(e.code), ''),
                e.id::text
            ) AS display_name_value
        FROM master.employee e
        WHERE e.tenant_id = p_tenant_id
          AND e.company_code_id IS NOT NULL
    ) se
    JOIN master.employment em
      ON em.tenant_id = se.tenant_id
     AND em.employee_id = se.id
     AND em.code = 'EMPLOY-' || se.employee_key
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS assignments_created = ROW_COUNT;

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION master.backfill_people_from_employee(uuid) IS
    'Backfills Phase 1 People person/employment/work_assignment rows from existing master.employee for one tenant.';
