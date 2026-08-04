ALTER TABLE ledger.budget_transaction
    ADD CONSTRAINT budget_transaction_profile_fk
    FOREIGN KEY (tenant_id, project_id, budget_profile_id)
    REFERENCES document.budget_profile (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_transaction_allocation_fk
    FOREIGN KEY (tenant_id, budget_profile_id, budget_allocation_id)
    REFERENCES document.budget_allocation (tenant_id, budget_profile_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_transaction_wbs_fk
    FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_transaction_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_transaction_performed_by_fk FOREIGN KEY (tenant_id, performed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_transaction_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ledger.budget_balance
    ADD CONSTRAINT budget_balance_allocation_fk FOREIGN KEY (tenant_id, budget_allocation_id)
    REFERENCES document.budget_allocation (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT budget_balance_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ledger.planning_run
    ADD CONSTRAINT planning_run_model_fk
    FOREIGN KEY (tenant_id, company_code_id, planning_model_id)
    REFERENCES control.planning_model (tenant_id, company_code_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_run_scenario_fk
    FOREIGN KEY (tenant_id, planning_model_id, planning_scenario_id)
    REFERENCES document.planning_scenario (tenant_id, planning_model_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_run_book_fk FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_run_approved_by_fk FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_run_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ledger.planning_output
    ADD CONSTRAINT planning_output_run_fk FOREIGN KEY (tenant_id, planning_model_id, planning_run_id)
    REFERENCES ledger.planning_run (tenant_id, planning_model_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT planning_output_driver_fk FOREIGN KEY (tenant_id, planning_model_id, planning_driver_id)
    REFERENCES control.planning_driver (tenant_id, planning_model_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_book_fk FOREIGN KEY (tenant_id, ledger_book_id)
    REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_gl_fk FOREIGN KEY (tenant_id, gl_account_id)
    REFERENCES master.gl_account (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id)
    REFERENCES master.cost_center (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id)
    REFERENCES master.profit_center (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_project_fk FOREIGN KEY (tenant_id, project_id)
    REFERENCES master.project (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_wbs_fk FOREIGN KEY (tenant_id, project_id, project_wbs_id)
    REFERENCES master.project_wbs (tenant_id, project_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_currency_fk FOREIGN KEY (currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT planning_output_created_by_fk FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
