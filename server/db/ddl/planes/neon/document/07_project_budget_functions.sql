CREATE OR REPLACE FUNCTION document.trg_validate_project_task()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_wbs master.project_wbs%ROWTYPE;
BEGIN
    SELECT * INTO v_wbs
      FROM master.project_wbs
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.project_wbs_id;
    IF FOUND AND (
        NOT v_wbs.is_postable
        OR v_wbs.wbs_type <> 'work_package'
        OR EXISTS (
            SELECT 1 FROM master.project_wbs c
             WHERE c.tenant_id = v_wbs.tenant_id
               AND c.project_id = v_wbs.project_id
               AND c.parent_wbs_id = v_wbs.id
        )
    ) THEN
        RAISE EXCEPTION 'Project tasks require a postable leaf work-package WBS'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_project_task_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_uom text;
BEGIN
    SELECT uom_code INTO v_uom
      FROM master.project_item
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.project_item_id;
    IF FOUND AND v_uom <> NEW.uom_code THEN
        RAISE EXCEPTION 'Task requirement UOM must match its project item UOM'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_budget_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_currency character(3);
BEGIN
    SELECT currency_code INTO v_currency
      FROM master.project
     WHERE tenant_id = NEW.tenant_id
       AND company_code_id = NEW.company_code_id
       AND id = NEW.project_id;
    IF FOUND AND v_currency <> NEW.currency_code THEN
        RAISE EXCEPTION 'Budget currency must match the project currency'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.company_code_id = NEW.company_code_id
           AND a.book_id = NEW.ledger_book_id
           AND a.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Budget ledger book must be actively assigned to the project company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_budget_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_profile document.budget_profile%ROWTYPE;
    v_postable boolean;
    v_existing_allocated numeric(18,4);
    v_proposed_allocated numeric(18,4);
BEGIN
    SELECT * INTO v_profile
      FROM document.budget_profile
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.budget_profile_id
     FOR UPDATE;

    IF FOUND AND NEW.fiscal_year NOT BETWEEN
       v_profile.fiscal_year_from AND v_profile.fiscal_year_to THEN
        RAISE EXCEPTION 'Allocation fiscal year falls outside the budget profile'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT is_postable INTO v_postable
      FROM master.project_wbs
     WHERE tenant_id = NEW.tenant_id
       AND project_id = NEW.project_id
       AND id = NEW.project_wbs_id;
    IF FOUND AND NOT v_postable THEN
        RAISE EXCEPTION 'Budget allocations require a postable WBS'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(sum(a.allocated_amount), 0)
      INTO v_existing_allocated
      FROM document.budget_allocation a
    WHERE a.tenant_id = NEW.tenant_id
       AND a.budget_profile_id = NEW.budget_profile_id
       AND a.status <> 'cancelled'
       AND a.id <> NEW.id;

    v_proposed_allocated := v_existing_allocated;
    IF NEW.status <> 'cancelled' THEN
        v_proposed_allocated := v_proposed_allocated + NEW.allocated_amount;
    END IF;

    IF v_profile.id IS NOT NULL
       AND v_proposed_allocated > v_profile.authorized_amount THEN
        RAISE EXCEPTION 'Active allocations exceed the budget authorized amount'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
