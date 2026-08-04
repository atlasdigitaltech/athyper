-- Neon-only invoker functions use deterministic administrator-owned schemas.
ALTER FUNCTION control.trg_guard_risk_source_config_identity()
    SET search_path = pg_catalog, control, shared;
ALTER FUNCTION control.trg_validate_payment_execution_profile()
    SET search_path = pg_catalog, control, master, shared;

ALTER FUNCTION ledger.trg_assert_ic_group_balanced()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_guard_book_period_identity()
    SET search_path = pg_catalog, ledger, shared;
ALTER FUNCTION ledger.trg_guard_gl_balance_projection()
    SET search_path = pg_catalog, ledger, shared;
ALTER FUNCTION ledger.trg_guard_inventory_balance_projection()
    SET search_path = pg_catalog, ledger, shared;
ALTER FUNCTION ledger.trg_reject_fact_mutation()
    SET search_path = pg_catalog, ledger, shared;
ALTER FUNCTION ledger.trg_validate_accounting_coordinates()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_asset_reserve()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_commitment_fulfillment()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_fx_run_group()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_ic_group()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_inventory_reversal()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_inventory_warehouse()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_tax_calculation_reversal()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_tax_credit_reversal()
    SET search_path = pg_catalog, ledger, document, control, master, shared;
ALTER FUNCTION ledger.trg_validate_valuation_layer()
    SET search_path = pg_catalog, ledger, document, control, master, shared;

ALTER FUNCTION master.trg_block_operational_bank_delete()
    SET search_path = pg_catalog, master, document, ledger, shared;
ALTER FUNCTION master.trg_guard_warehouse_identity()
    SET search_path = pg_catalog, master, shared;
ALTER FUNCTION master.trg_validate_certification_type_scope()
    SET search_path = pg_catalog, master, shared;
