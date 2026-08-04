CREATE INDEX planning_model_book_idx
    ON control.planning_model (tenant_id, ledger_book_id);
CREATE INDEX planning_model_based_on_idx
    ON control.planning_model (tenant_id, based_on_model_id)
    WHERE based_on_model_id IS NOT NULL;
CREATE INDEX planning_model_status_idx
    ON control.planning_model (tenant_id, company_code_id, status);
CREATE INDEX planning_model_responsible_idx
    ON control.planning_model (tenant_id, responsible_principal_id)
    WHERE responsible_principal_id IS NOT NULL;
CREATE INDEX planning_model_created_by_idx
    ON control.planning_model (tenant_id, created_by);

CREATE INDEX planning_driver_formula_idx
    ON control.planning_driver (tenant_id, formula_expression_id)
    WHERE formula_expression_id IS NOT NULL;
CREATE INDEX planning_driver_status_idx
    ON control.planning_driver (tenant_id, planning_model_id, status);
CREATE INDEX planning_driver_created_by_idx
    ON control.planning_driver (tenant_id, created_by);
CREATE INDEX planning_dependency_reverse_idx
    ON control.planning_driver_dependency
       (tenant_id, planning_model_id, depends_on_driver_id);
CREATE INDEX planning_dependency_created_by_idx
    ON control.planning_driver_dependency (tenant_id, created_by);
