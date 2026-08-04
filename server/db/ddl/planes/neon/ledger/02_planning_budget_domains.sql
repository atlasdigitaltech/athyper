CREATE DOMAIN ledger.budget_transaction_type_d AS text
    CHECK (VALUE IN ('allocate', 'reserve', 'release', 'consume', 'adjust', 'reverse'));

CREATE DOMAIN ledger.budget_direction_d AS text
    CHECK (VALUE IN ('debit', 'credit'));

CREATE DOMAIN ledger.planning_run_status_d AS text
    CHECK (VALUE IN ('pending', 'running', 'completed', 'approved', 'failed', 'cancelled'));
