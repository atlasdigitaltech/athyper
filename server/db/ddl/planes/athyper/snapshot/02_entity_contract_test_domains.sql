CREATE DOMAIN snapshot.entity_contract_test_run_status_d AS text
    CHECK (VALUE IN ('passed', 'failed', 'error'));

CREATE DOMAIN snapshot.entity_contract_test_actual_outcome_d AS text
    CHECK (VALUE IN ('pass', 'fail', 'warning', 'error'));
