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

ALTER TABLE ledger.book_period_status
    ADD CONSTRAINT book_period_status_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT book_period_status_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT book_period_status_period_fk
        FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT book_period_status_opened_by_fk
        FOREIGN KEY (tenant_id, opened_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_soft_by_fk
        FOREIGN KEY (tenant_id, soft_closed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_hard_by_fk
        FOREIGN KEY (tenant_id, hard_closed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.gl_balance
    ADD CONSTRAINT gl_balance_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT gl_balance_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT gl_balance_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT gl_balance_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT gl_balance_account_fk FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT gl_balance_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT gl_balance_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT gl_balance_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT gl_balance_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT gl_balance_dimension_fk FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set(tenant_id, id),
    ADD CONSTRAINT gl_balance_last_journal_fk FOREIGN KEY (tenant_id, last_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT gl_balance_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT gl_balance_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.commitment_fulfillment
    ADD CONSTRAINT commitment_fulfillment_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT commitment_fulfillment_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT commitment_fulfillment_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id),
    ADD CONSTRAINT commitment_fulfillment_line_fk FOREIGN KEY (tenant_id, commitment_line_id) REFERENCES document.commitment_line(tenant_id, id),
    ADD CONSTRAINT commitment_fulfillment_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT commitment_fulfillment_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT commitment_fulfillment_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT commitment_fulfillment_base_currency_fk FOREIGN KEY (base_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT commitment_fulfillment_reversal_fk FOREIGN KEY (tenant_id, reverses_fulfillment_id) REFERENCES ledger.commitment_fulfillment(tenant_id, id),
    ADD CONSTRAINT commitment_fulfillment_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.inventory_movement
    ADD CONSTRAINT inventory_movement_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT inventory_movement_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT inventory_movement_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT inventory_movement_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse(tenant_id, id),
    ADD CONSTRAINT inventory_movement_source_warehouse_fk FOREIGN KEY (tenant_id, source_warehouse_id) REFERENCES master.warehouse(tenant_id, id),
    ADD CONSTRAINT inventory_movement_destination_warehouse_fk FOREIGN KEY (tenant_id, destination_warehouse_id) REFERENCES master.warehouse(tenant_id, id),
    ADD CONSTRAINT inventory_movement_uom_fk FOREIGN KEY (uom_code) REFERENCES shared.uom(code),
    ADD CONSTRAINT inventory_movement_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT inventory_movement_reversal_fk FOREIGN KEY (tenant_id, reverses_movement_id) REFERENCES ledger.inventory_movement(tenant_id, id),
    ADD CONSTRAINT inventory_movement_journal_fk FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT inventory_movement_performed_by_fk FOREIGN KEY (tenant_id, performed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT inventory_movement_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.inventory_balance
    ADD CONSTRAINT inventory_balance_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT inventory_balance_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT inventory_balance_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT inventory_balance_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse(tenant_id, id),
    ADD CONSTRAINT inventory_balance_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT inventory_balance_last_movement_fk FOREIGN KEY (tenant_id, last_movement_id) REFERENCES ledger.inventory_movement(tenant_id, id),
    ADD CONSTRAINT inventory_balance_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT inventory_balance_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.inventory_valuation_layer
    ADD CONSTRAINT inventory_valuation_layer_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT inventory_valuation_layer_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT inventory_valuation_layer_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES master.item(tenant_id, id),
    ADD CONSTRAINT inventory_valuation_layer_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES master.warehouse(tenant_id, id),
    ADD CONSTRAINT inventory_valuation_layer_receipt_fk FOREIGN KEY (tenant_id, receipt_movement_id) REFERENCES ledger.inventory_movement(tenant_id, id),
    ADD CONSTRAINT inventory_valuation_layer_last_consumption_fk FOREIGN KEY (tenant_id, last_consumption_movement_id) REFERENCES ledger.inventory_movement(tenant_id, id),
    ADD CONSTRAINT inventory_valuation_layer_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT inventory_valuation_layer_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT inventory_valuation_layer_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.tax_calculation
    ADD CONSTRAINT tax_calculation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_calculation_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT tax_calculation_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT tax_calculation_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT tax_calculation_jurisdiction_fk FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_calculation_type_fk FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id),
    ADD CONSTRAINT tax_calculation_group_fk FOREIGN KEY (tenant_id, tax_group_id) REFERENCES control.tax_group(tenant_id, id),
    ADD CONSTRAINT tax_calculation_schedule_fk FOREIGN KEY (tenant_id, tax_rate_schedule_id) REFERENCES control.tax_rate_schedule(tenant_id, id),
    ADD CONSTRAINT tax_calculation_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT tax_calculation_journal_fk FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT tax_calculation_journal_line_fk FOREIGN KEY (tenant_id, journal_line_id) REFERENCES document.journal_line(tenant_id, id),
    ADD CONSTRAINT tax_calculation_reversal_fk FOREIGN KEY (tenant_id, reverses_calculation_id) REFERENCES ledger.tax_calculation(tenant_id, id),
    ADD CONSTRAINT tax_calculation_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT tax_calculation_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.tax_credit_movement
    ADD CONSTRAINT tax_credit_movement_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT tax_credit_movement_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_jurisdiction_fk FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_type_fk FOREIGN KEY (tenant_id, tax_type_id) REFERENCES master.tax_type(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT tax_credit_movement_source_fk FOREIGN KEY (tenant_id, source_tax_calculation_id) REFERENCES ledger.tax_calculation(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_reversal_fk FOREIGN KEY (tenant_id, reverses_movement_id) REFERENCES ledger.tax_credit_movement(tenant_id, id),
    ADD CONSTRAINT tax_credit_movement_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.asset_revaluation_reserve
    ADD CONSTRAINT asset_revaluation_reserve_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT asset_revaluation_reserve_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_asset_book_fk FOREIGN KEY (tenant_id, asset_book_id) REFERENCES master.asset_book(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT asset_revaluation_reserve_journal_fk FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_reversal_fk FOREIGN KEY (tenant_id, reverses_reserve_id) REFERENCES ledger.asset_revaluation_reserve(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_posted_by_fk FOREIGN KEY (tenant_id, posted_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT asset_revaluation_reserve_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.fx_revaluation_line
    ADD CONSTRAINT fx_revaluation_line_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fx_revaluation_line_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_account_fk FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_tx_currency_fk FOREIGN KEY (transaction_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT fx_revaluation_line_fn_currency_fk FOREIGN KEY (functional_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT fx_revaluation_line_partner_fk FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_dimension_fk FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_journal_fk FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT fx_revaluation_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE ledger.ic_elimination_line
    ADD CONSTRAINT ic_elimination_line_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT ic_elimination_line_consolidation_company_fk FOREIGN KEY (tenant_id, consolidation_company_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_source_company_fk FOREIGN KEY (tenant_id, source_company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_counterparty_company_fk FOREIGN KEY (tenant_id, counterparty_company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_book_fk FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_period_fk FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_account_fk FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_currency_fk FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT ic_elimination_line_functional_currency_fk FOREIGN KEY (functional_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT ic_elimination_line_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_dimension_fk FOREIGN KEY (tenant_id, dimension_set_id) REFERENCES master.dimension_set(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_journal_fk FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES document.journal_entry(tenant_id, id),
    ADD CONSTRAINT ic_elimination_line_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);
ALTER TABLE ledger.cross_book_posting_execution
    ADD CONSTRAINT cross_book_posting_execution_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_source_journal_fk
        FOREIGN KEY (tenant_id, source_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_policy_fk
        FOREIGN KEY (tenant_id, cross_book_posting_policy_id) REFERENCES control.cross_book_posting_policy(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_target_journal_fk
        FOREIGN KEY (tenant_id, target_journal_entry_id) REFERENCES document.journal_entry(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_status_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cross_book_posting_execution_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
