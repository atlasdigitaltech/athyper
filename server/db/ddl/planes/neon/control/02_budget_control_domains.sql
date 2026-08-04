CREATE DOMAIN control.budget_period_scope_d AS text
    CHECK (VALUE IN ('current_period', 'year_to_date', 'fiscal_year', 'rolling_12_periods'));

CREATE DOMAIN control.budget_consumption_basis_d AS text
    CHECK (VALUE IN (
        'actuals',
        'actuals_and_commitments',
        'actuals_commitments_and_forecast'
    ));
