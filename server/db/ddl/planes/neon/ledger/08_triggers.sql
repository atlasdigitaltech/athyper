CREATE TRIGGER trg_budget_transaction_00_created_by
BEFORE INSERT ON ledger.budget_transaction
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_budget_transaction_90_no_update
BEFORE UPDATE OR DELETE ON ledger.budget_transaction
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_mutation();

CREATE TRIGGER trg_budget_balance_00_created_by
BEFORE INSERT ON ledger.budget_balance
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_budget_balance_10_identity
BEFORE UPDATE ON ledger.budget_balance
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_identity_evidence();
CREATE TRIGGER trg_budget_balance_90_updated_at
BEFORE UPDATE ON ledger.budget_balance
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_planning_run_00_created_by
BEFORE INSERT ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_planning_run_05_validate
BEFORE INSERT ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_planning_run();
CREATE TRIGGER trg_planning_run_10_identity
BEFORE UPDATE ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_identity_evidence();
CREATE TRIGGER trg_planning_run_15_scope
BEFORE UPDATE ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_planning_run();
CREATE TRIGGER trg_planning_run_80_status
BEFORE UPDATE OF status ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION ledger.trg_stamp_run_status();
CREATE TRIGGER trg_planning_run_90_updated_at
BEFORE UPDATE ON ledger.planning_run
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_planning_output_00_created_by
BEFORE INSERT ON ledger.planning_output
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();
CREATE TRIGGER trg_planning_output_90_no_update
BEFORE UPDATE OR DELETE ON ledger.planning_output
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_mutation();

CREATE TRIGGER book_period_status_identity_guard
BEFORE INSERT OR UPDATE ON ledger.book_period_status
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_book_period_identity();
CREATE TRIGGER book_period_status_status_changed
BEFORE UPDATE OF status ON ledger.book_period_status
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER book_period_status_updated_at
BEFORE UPDATE ON ledger.book_period_status
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER gl_balance_10_coordinates BEFORE INSERT OR UPDATE ON ledger.gl_balance
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER gl_balance_20_projection_guard BEFORE UPDATE ON ledger.gl_balance
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_gl_balance_projection();
CREATE TRIGGER gl_balance_90_updated BEFORE UPDATE ON ledger.gl_balance
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER commitment_fulfillment_10_coordinates BEFORE INSERT ON ledger.commitment_fulfillment
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER commitment_fulfillment_20_consistency BEFORE INSERT ON ledger.commitment_fulfillment
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_commitment_fulfillment();
CREATE TRIGGER commitment_fulfillment_90_immutable BEFORE UPDATE OR DELETE ON ledger.commitment_fulfillment
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER inventory_movement_05_warehouse BEFORE INSERT ON ledger.inventory_movement
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_inventory_warehouse();
CREATE TRIGGER inventory_movement_10_reversal BEFORE INSERT ON ledger.inventory_movement
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_inventory_reversal();
CREATE TRIGGER inventory_movement_90_immutable BEFORE UPDATE OR DELETE ON ledger.inventory_movement
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER inventory_balance_05_warehouse BEFORE INSERT OR UPDATE ON ledger.inventory_balance
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_inventory_warehouse();
CREATE TRIGGER inventory_balance_10_projection_guard BEFORE UPDATE ON ledger.inventory_balance
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_inventory_balance_projection();
CREATE TRIGGER inventory_balance_90_updated BEFORE UPDATE ON ledger.inventory_balance
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER inventory_valuation_layer_05_warehouse BEFORE INSERT ON ledger.inventory_valuation_layer
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_inventory_warehouse();
CREATE TRIGGER inventory_valuation_layer_10_guard BEFORE INSERT OR UPDATE ON ledger.inventory_valuation_layer
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_valuation_layer();
CREATE TRIGGER inventory_valuation_layer_90_updated BEFORE UPDATE ON ledger.inventory_valuation_layer
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER inventory_valuation_layer_delete_guard BEFORE DELETE ON ledger.inventory_valuation_layer
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER tax_calculation_10_coordinates BEFORE INSERT ON ledger.tax_calculation
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER tax_calculation_20_reversal BEFORE INSERT ON ledger.tax_calculation
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_tax_calculation_reversal();
CREATE TRIGGER tax_calculation_90_immutable BEFORE UPDATE OR DELETE ON ledger.tax_calculation
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER tax_credit_movement_10_coordinates BEFORE INSERT ON ledger.tax_credit_movement
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER tax_credit_movement_20_reversal BEFORE INSERT ON ledger.tax_credit_movement
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_tax_credit_reversal();
CREATE TRIGGER tax_credit_movement_90_immutable BEFORE UPDATE OR DELETE ON ledger.tax_credit_movement
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER asset_revaluation_reserve_10_coordinates BEFORE INSERT ON ledger.asset_revaluation_reserve
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER asset_revaluation_reserve_20_asset_book BEFORE INSERT ON ledger.asset_revaluation_reserve
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_asset_reserve();
CREATE TRIGGER asset_revaluation_reserve_90_immutable BEFORE UPDATE OR DELETE ON ledger.asset_revaluation_reserve
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER fx_revaluation_line_10_coordinates BEFORE INSERT ON ledger.fx_revaluation_line
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER fx_revaluation_line_20_run_group BEFORE INSERT ON ledger.fx_revaluation_line
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_fx_run_group();
CREATE TRIGGER fx_revaluation_line_90_immutable BEFORE UPDATE OR DELETE ON ledger.fx_revaluation_line
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();

CREATE TRIGGER ic_elimination_line_10_coordinates BEFORE INSERT ON ledger.ic_elimination_line
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_accounting_coordinates();
CREATE TRIGGER ic_elimination_line_20_group BEFORE INSERT ON ledger.ic_elimination_line
FOR EACH ROW EXECUTE FUNCTION ledger.trg_validate_ic_group();
CREATE TRIGGER ic_elimination_line_90_immutable BEFORE UPDATE OR DELETE ON ledger.ic_elimination_line
FOR EACH ROW EXECUTE FUNCTION ledger.trg_reject_fact_mutation();
CREATE CONSTRAINT TRIGGER ic_elimination_line_balance
AFTER INSERT ON ledger.ic_elimination_line
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ledger.trg_assert_ic_group_balanced();
CREATE TRIGGER cross_book_posting_execution_10_guard
BEFORE INSERT OR UPDATE ON ledger.cross_book_posting_execution
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_cross_book_posting_execution();

CREATE TRIGGER cross_book_posting_execution_20_status
BEFORE UPDATE OF status ON ledger.cross_book_posting_execution
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER cross_book_posting_execution_90_updated
BEFORE UPDATE ON ledger.cross_book_posting_execution
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
