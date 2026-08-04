CREATE OR REPLACE FUNCTION master.trg_set_site_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_parent_company uuid;
    v_parent_level   smallint;
    v_cycle          boolean;
BEGIN
    IF NEW.parent_site_id IS NULL THEN
        NEW.level_no := 1;
        RETURN NEW;
    END IF;

    SELECT s.company_code_id, s.level_no
      INTO v_parent_company, v_parent_level
      FROM master.site s
     WHERE s.tenant_id = NEW.tenant_id
       AND s.id = NEW.parent_site_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent site % does not exist in tenant %',
            NEW.parent_site_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent_company <> NEW.company_code_id THEN
        RAISE EXCEPTION 'Parent and child sites must belong to the same company code'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    WITH RECURSIVE ancestors AS (
        SELECT s.id, s.parent_site_id
          FROM master.site s
         WHERE s.tenant_id = NEW.tenant_id
           AND s.id = NEW.parent_site_id
        UNION ALL
        SELECT p.id, p.parent_site_id
          FROM master.site p
          JOIN ancestors a ON p.id = a.parent_site_id
         WHERE p.tenant_id = NEW.tenant_id
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
      INTO v_cycle;

    IF v_cycle THEN
        RAISE EXCEPTION 'Site hierarchy cycle detected for site %', NEW.id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    NEW.level_no := v_parent_level + 1;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_set_site_hierarchy() IS
  'Derives site level and rejects cross-company parents and hierarchy cycles.';

CREATE OR REPLACE FUNCTION master.trg_validate_work_assignment_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_employee_id uuid;
    v_company_id  uuid;
BEGIN
    IF NEW.employment_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT e.employee_id, e.company_code_id
      INTO v_employee_id, v_company_id
      FROM master.employment e
     WHERE e.tenant_id = NEW.tenant_id
       AND e.id = NEW.employment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employment % does not exist in tenant %',
            NEW.employment_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_employee_id IS NOT NULL AND v_employee_id <> NEW.employee_id THEN
        RAISE EXCEPTION 'Work assignment employee does not match employment employee'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION 'Work assignment company does not match employment company'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_work_assignment_contract() IS
  'Requires an assignment employment, employee, and company code to describe the same workforce contract.';
