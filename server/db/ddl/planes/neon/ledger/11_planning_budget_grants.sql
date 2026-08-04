DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT USAGE ON SCHEMA ledger TO athyperapp;
        GRANT SELECT, INSERT ON
            ledger.budget_transaction,
            ledger.planning_output
        TO athyperapp;
        GRANT SELECT ON ledger.budget_balance TO athyperapp;
        GRANT SELECT, INSERT, UPDATE ON ledger.planning_run TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT USAGE ON SCHEMA ledger TO athyperadmin;
        GRANT ALL PRIVILEGES ON
            ledger.budget_transaction,
            ledger.budget_balance,
            ledger.planning_run,
            ledger.planning_output
        TO athyperadmin;
    END IF;
END;
$$;
