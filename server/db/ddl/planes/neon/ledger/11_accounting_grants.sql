REVOKE ALL ON
    ledger.cross_book_posting_execution,
    ledger.gl_balance,
    ledger.commitment_fulfillment,
    ledger.inventory_movement,
    ledger.inventory_balance,
    ledger.inventory_valuation_layer,
    ledger.tax_calculation,
    ledger.tax_credit_movement,
    ledger.asset_revaluation_reserve,
    ledger.fx_revaluation_line,
    ledger.ic_elimination_line
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            ledger.cross_book_posting_execution,
            ledger.gl_balance,
            ledger.inventory_balance,
            ledger.inventory_valuation_layer
        TO athyperapp;

        GRANT SELECT, INSERT ON
            ledger.commitment_fulfillment,
            ledger.inventory_movement,
            ledger.tax_calculation,
            ledger.tax_credit_movement,
            ledger.asset_revaluation_reserve,
            ledger.fx_revaluation_line,
            ledger.ic_elimination_line
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            ledger.cross_book_posting_execution,
            ledger.gl_balance,
            ledger.commitment_fulfillment,
            ledger.inventory_movement,
            ledger.inventory_balance,
            ledger.inventory_valuation_layer,
            ledger.tax_calculation,
            ledger.tax_credit_movement,
            ledger.asset_revaluation_reserve,
            ledger.fx_revaluation_line,
            ledger.ic_elimination_line
        TO athyperadmin;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ledger TO athyperadmin;
    END IF;
END;
$$;
