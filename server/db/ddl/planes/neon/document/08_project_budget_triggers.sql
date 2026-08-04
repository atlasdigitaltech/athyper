DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'project_task', 'project_task_requirement', 'budget_profile', 'budget_allocation'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_00_created_by BEFORE INSERT ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_10_identity BEFORE UPDATE ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_80_status BEFORE UPDATE OF status ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_90_updated_at BEFORE UPDATE ON document.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_project_task_20_validate
BEFORE INSERT OR UPDATE OF project_id, project_wbs_id
ON document.project_task
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_project_task();

CREATE TRIGGER trg_project_task_requirement_20_validate
BEFORE INSERT OR UPDATE OF project_id, project_item_id, uom_code
ON document.project_task_requirement
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_project_task_requirement();

CREATE TRIGGER trg_budget_profile_20_validate
BEFORE INSERT OR UPDATE OF project_id, company_code_id, ledger_book_id, currency_code
ON document.budget_profile
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_budget_profile();

CREATE TRIGGER trg_budget_allocation_20_validate
BEFORE INSERT OR UPDATE OF budget_profile_id, project_id, project_wbs_id,
    fiscal_year, allocated_amount, status
ON document.budget_allocation
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_budget_allocation();
