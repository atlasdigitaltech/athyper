CREATE INDEX budget_transaction_allocation_idx
    ON ledger.budget_transaction
       (tenant_id, budget_allocation_id, fiscal_year, period_number, performed_at);
CREATE INDEX budget_transaction_profile_allocation_idx
    ON ledger.budget_transaction
       (tenant_id, budget_profile_id, budget_allocation_id);
CREATE INDEX budget_transaction_wbs_idx
    ON ledger.budget_transaction
       (tenant_id, project_id, project_wbs_id, effective_date);
CREATE INDEX budget_transaction_source_idx
    ON ledger.budget_transaction
       (tenant_id, source_document_type, source_document_id);
CREATE INDEX budget_transaction_profile_idx
    ON ledger.budget_transaction (tenant_id, project_id, budget_profile_id);
CREATE INDEX budget_transaction_performed_by_idx
    ON ledger.budget_transaction (tenant_id, performed_by);
CREATE INDEX budget_transaction_created_by_idx
    ON ledger.budget_transaction (tenant_id, created_by);

CREATE INDEX budget_balance_created_by_idx
    ON ledger.budget_balance (tenant_id, created_by);

CREATE INDEX planning_run_model_company_idx
    ON ledger.planning_run (tenant_id, company_code_id, planning_model_id);
CREATE INDEX planning_run_scenario_idx
    ON ledger.planning_run (tenant_id, planning_scenario_id, created_at);
CREATE INDEX planning_run_status_idx
    ON ledger.planning_run (tenant_id, planning_model_id, status, created_at);
CREATE INDEX planning_run_book_idx
    ON ledger.planning_run (tenant_id, ledger_book_id);
CREATE INDEX planning_run_approved_by_idx
    ON ledger.planning_run (tenant_id, approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX planning_run_created_by_idx
    ON ledger.planning_run (tenant_id, created_by);
CREATE INDEX planning_output_run_idx
    ON ledger.planning_output (tenant_id, planning_model_id, planning_run_id);
CREATE INDEX planning_output_driver_idx
    ON ledger.planning_output (tenant_id, planning_model_id, planning_driver_id)
    WHERE planning_driver_id IS NOT NULL;
CREATE INDEX planning_output_wbs_idx
    ON ledger.planning_output (tenant_id, project_id, project_wbs_id)
    WHERE project_wbs_id IS NOT NULL;
CREATE INDEX planning_output_gl_idx
    ON ledger.planning_output (tenant_id, gl_account_id)
    WHERE gl_account_id IS NOT NULL;
CREATE INDEX planning_output_book_idx
    ON ledger.planning_output (tenant_id, ledger_book_id);
CREATE INDEX planning_output_cost_center_idx
    ON ledger.planning_output (tenant_id, cost_center_id)
    WHERE cost_center_id IS NOT NULL;
CREATE INDEX planning_output_profit_center_idx
    ON ledger.planning_output (tenant_id, profit_center_id)
    WHERE profit_center_id IS NOT NULL;
CREATE INDEX planning_output_created_by_idx
    ON ledger.planning_output (tenant_id, created_by);
