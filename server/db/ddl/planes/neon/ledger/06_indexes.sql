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

CREATE INDEX book_period_status_period_idx
    ON ledger.book_period_status (tenant_id, fiscal_period_id, status);
CREATE INDEX book_period_status_book_status_idx
    ON ledger.book_period_status (tenant_id, ledger_book_id, status);

CREATE INDEX gl_balance_company_period_idx ON ledger.gl_balance (tenant_id, company_code_id, ledger_book_id, fiscal_period_id);
CREATE INDEX gl_balance_account_idx ON ledger.gl_balance (tenant_id, gl_account_id);
CREATE INDEX gl_balance_cost_center_idx ON ledger.gl_balance (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX gl_balance_profit_center_idx ON ledger.gl_balance (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX gl_balance_project_idx ON ledger.gl_balance (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX gl_balance_dimension_idx ON ledger.gl_balance (tenant_id, dimension_set_id) WHERE dimension_set_id IS NOT NULL;
CREATE INDEX gl_balance_last_journal_idx ON ledger.gl_balance (tenant_id, last_journal_entry_id) WHERE last_journal_entry_id IS NOT NULL;
CREATE INDEX gl_balance_created_by_idx ON ledger.gl_balance (tenant_id, created_by);
CREATE INDEX gl_balance_updated_by_idx ON ledger.gl_balance (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX commitment_fulfillment_commitment_idx ON ledger.commitment_fulfillment (tenant_id, commitment_id);
CREATE INDEX commitment_fulfillment_line_idx ON ledger.commitment_fulfillment (tenant_id, commitment_line_id);
CREATE INDEX commitment_fulfillment_period_idx ON ledger.commitment_fulfillment (tenant_id, fiscal_period_id);
CREATE INDEX commitment_fulfillment_source_idx ON ledger.commitment_fulfillment (tenant_id, source_entity_type, source_entity_id, source_line_id);
CREATE INDEX commitment_fulfillment_reversal_idx ON ledger.commitment_fulfillment (tenant_id, reverses_fulfillment_id) WHERE reverses_fulfillment_id IS NOT NULL;
CREATE INDEX commitment_fulfillment_created_by_idx ON ledger.commitment_fulfillment (tenant_id, created_by);

CREATE INDEX inventory_movement_position_idx ON ledger.inventory_movement (tenant_id, company_code_id, item_id, warehouse_id, performed_at DESC);
CREATE INDEX inventory_movement_rebuild_idx ON ledger.inventory_movement (tenant_id, company_code_id, item_id, warehouse_id, lot_number, serial_number, movement_sequence);
CREATE INDEX inventory_movement_warehouse_idx ON ledger.inventory_movement (tenant_id, warehouse_id);
CREATE INDEX inventory_movement_source_warehouse_idx ON ledger.inventory_movement (tenant_id, source_warehouse_id) WHERE source_warehouse_id IS NOT NULL;
CREATE INDEX inventory_movement_destination_warehouse_idx ON ledger.inventory_movement (tenant_id, destination_warehouse_id) WHERE destination_warehouse_id IS NOT NULL;
CREATE INDEX inventory_movement_source_idx ON ledger.inventory_movement (tenant_id, source_entity_type, source_entity_id, source_line_id);
CREATE INDEX inventory_movement_reversal_idx ON ledger.inventory_movement (tenant_id, reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
CREATE INDEX inventory_movement_journal_idx ON ledger.inventory_movement (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX inventory_movement_performed_by_idx ON ledger.inventory_movement (tenant_id, performed_by);
CREATE INDEX inventory_movement_created_by_idx ON ledger.inventory_movement (tenant_id, created_by);

CREATE INDEX inventory_balance_item_idx ON ledger.inventory_balance (tenant_id, company_code_id, item_id);
CREATE INDEX inventory_balance_warehouse_idx ON ledger.inventory_balance (tenant_id, warehouse_id);
CREATE INDEX inventory_balance_last_movement_idx ON ledger.inventory_balance (tenant_id, last_movement_id);
CREATE INDEX inventory_balance_created_by_idx ON ledger.inventory_balance (tenant_id, created_by);
CREATE INDEX inventory_balance_updated_by_idx ON ledger.inventory_balance (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX inventory_valuation_layer_open_idx ON ledger.inventory_valuation_layer
    (tenant_id, item_id, warehouse_id, layer_date, id) WHERE remaining_quantity > 0;
CREATE INDEX inventory_valuation_layer_warehouse_idx ON ledger.inventory_valuation_layer (tenant_id, warehouse_id);
CREATE INDEX inventory_valuation_layer_last_consumption_idx ON ledger.inventory_valuation_layer
    (tenant_id, last_consumption_movement_id) WHERE last_consumption_movement_id IS NOT NULL;
CREATE INDEX inventory_valuation_layer_created_by_idx ON ledger.inventory_valuation_layer (tenant_id, created_by);
CREATE INDEX inventory_valuation_layer_updated_by_idx ON ledger.inventory_valuation_layer (tenant_id, updated_by) WHERE updated_by IS NOT NULL;

CREATE INDEX tax_calculation_company_period_idx ON ledger.tax_calculation (tenant_id, company_code_id, ledger_book_id, fiscal_period_id);
CREATE INDEX tax_calculation_source_idx ON ledger.tax_calculation (tenant_id, source_entity_type, source_entity_id, source_line_id);
CREATE INDEX tax_calculation_jurisdiction_idx ON ledger.tax_calculation (tenant_id, jurisdiction_id, tax_type_id, fiscal_period_id);
CREATE INDEX tax_calculation_group_idx ON ledger.tax_calculation (tenant_id, tax_group_id) WHERE tax_group_id IS NOT NULL;
CREATE INDEX tax_calculation_schedule_idx ON ledger.tax_calculation (tenant_id, tax_rate_schedule_id) WHERE tax_rate_schedule_id IS NOT NULL;
CREATE INDEX tax_calculation_journal_idx ON ledger.tax_calculation (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX tax_calculation_journal_line_idx ON ledger.tax_calculation (tenant_id, journal_line_id) WHERE journal_line_id IS NOT NULL;
CREATE INDEX tax_calculation_reversal_idx ON ledger.tax_calculation (tenant_id, reverses_calculation_id) WHERE reverses_calculation_id IS NOT NULL;
CREATE UNIQUE INDEX tax_calculation_one_reversal_uq ON ledger.tax_calculation (tenant_id, reverses_calculation_id) WHERE reverses_calculation_id IS NOT NULL;
CREATE INDEX tax_calculation_posted_by_idx ON ledger.tax_calculation (tenant_id, posted_by);
CREATE INDEX tax_calculation_created_by_idx ON ledger.tax_calculation (tenant_id, created_by);

CREATE INDEX tax_credit_movement_period_idx ON ledger.tax_credit_movement
    (tenant_id, company_code_id, ledger_book_id, fiscal_period_id, jurisdiction_id, tax_type_id, tax_bucket);
CREATE INDEX tax_credit_movement_source_idx ON ledger.tax_credit_movement (tenant_id, source_tax_calculation_id) WHERE source_tax_calculation_id IS NOT NULL;
CREATE INDEX tax_credit_movement_reversal_idx ON ledger.tax_credit_movement (tenant_id, reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
CREATE UNIQUE INDEX tax_credit_movement_one_reversal_uq ON ledger.tax_credit_movement (tenant_id, reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
CREATE INDEX tax_credit_movement_created_by_idx ON ledger.tax_credit_movement (tenant_id, created_by);

CREATE INDEX asset_revaluation_reserve_asset_idx ON ledger.asset_revaluation_reserve (tenant_id, asset_id, asset_book_id, fiscal_period_id, posted_at DESC);
CREATE INDEX asset_revaluation_reserve_book_idx ON ledger.asset_revaluation_reserve (tenant_id, ledger_book_id);
CREATE INDEX asset_revaluation_reserve_journal_idx ON ledger.asset_revaluation_reserve (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX asset_revaluation_reserve_reversal_idx ON ledger.asset_revaluation_reserve (tenant_id, reverses_reserve_id) WHERE reverses_reserve_id IS NOT NULL;
CREATE INDEX asset_revaluation_reserve_source_idx ON ledger.asset_revaluation_reserve (tenant_id, source_entity_type, source_entity_id);
CREATE INDEX asset_revaluation_reserve_posted_by_idx ON ledger.asset_revaluation_reserve (tenant_id, posted_by);
CREATE INDEX asset_revaluation_reserve_created_by_idx ON ledger.asset_revaluation_reserve (tenant_id, created_by);

CREATE INDEX fx_revaluation_line_company_period_idx ON ledger.fx_revaluation_line (tenant_id, company_code_id, ledger_book_id, fiscal_period_id);
CREATE INDEX fx_revaluation_line_account_idx ON ledger.fx_revaluation_line (tenant_id, gl_account_id);
CREATE INDEX fx_revaluation_line_source_idx ON ledger.fx_revaluation_line (tenant_id, source_entity_type, source_entity_id, source_line_id);
CREATE INDEX fx_revaluation_line_partner_idx ON ledger.fx_revaluation_line (tenant_id, business_partner_id) WHERE business_partner_id IS NOT NULL;
CREATE INDEX fx_revaluation_line_cost_center_idx ON ledger.fx_revaluation_line (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX fx_revaluation_line_profit_center_idx ON ledger.fx_revaluation_line (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX fx_revaluation_line_project_idx ON ledger.fx_revaluation_line (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX fx_revaluation_line_dimension_idx ON ledger.fx_revaluation_line (tenant_id, dimension_set_id) WHERE dimension_set_id IS NOT NULL;
CREATE INDEX fx_revaluation_line_journal_idx ON ledger.fx_revaluation_line (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX fx_revaluation_line_created_by_idx ON ledger.fx_revaluation_line (tenant_id, created_by);

CREATE INDEX ic_elimination_line_group_idx ON ledger.ic_elimination_line (tenant_id, elimination_id);
CREATE INDEX ic_elimination_line_company_period_idx ON ledger.ic_elimination_line (tenant_id, consolidation_company_id, ledger_book_id, fiscal_period_id);
CREATE INDEX ic_elimination_line_source_company_idx ON ledger.ic_elimination_line (tenant_id, source_company_code_id);
CREATE INDEX ic_elimination_line_counterparty_idx ON ledger.ic_elimination_line (tenant_id, counterparty_company_code_id);
CREATE INDEX ic_elimination_line_account_idx ON ledger.ic_elimination_line (tenant_id, gl_account_id);
CREATE INDEX ic_elimination_line_cost_center_idx ON ledger.ic_elimination_line (tenant_id, cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX ic_elimination_line_profit_center_idx ON ledger.ic_elimination_line (tenant_id, profit_center_id) WHERE profit_center_id IS NOT NULL;
CREATE INDEX ic_elimination_line_project_idx ON ledger.ic_elimination_line (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX ic_elimination_line_site_idx ON ledger.ic_elimination_line (tenant_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX ic_elimination_line_dimension_idx ON ledger.ic_elimination_line (tenant_id, dimension_set_id) WHERE dimension_set_id IS NOT NULL;
CREATE INDEX ic_elimination_line_journal_idx ON ledger.ic_elimination_line (tenant_id, journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX ic_elimination_line_created_by_idx ON ledger.ic_elimination_line (tenant_id, created_by);
CREATE INDEX cross_book_posting_execution_status_idx
    ON ledger.cross_book_posting_execution (tenant_id, status, created_at);

CREATE INDEX cross_book_posting_execution_target_idx
    ON ledger.cross_book_posting_execution (tenant_id, target_journal_entry_id)
    WHERE target_journal_entry_id IS NOT NULL;

CREATE INDEX cross_book_posting_execution_retry_idx
    ON ledger.cross_book_posting_execution (tenant_id, last_attempt_at)
    WHERE status IN ('pending','processing','failed');

CREATE INDEX cross_book_posting_execution_correlation_idx
    ON ledger.cross_book_posting_execution (correlation_id)
    WHERE correlation_id IS NOT NULL;
