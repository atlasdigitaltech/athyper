CREATE INDEX policy_rule_definition_idx
    ON control.policy_rule (policy_definition_id, priority);
CREATE INDEX policy_rule_created_by_idx
    ON control.policy_rule (created_by);
CREATE INDEX policy_test_case_definition_idx
    ON control.policy_test_case (policy_definition_id, status, code);
CREATE INDEX policy_test_case_created_by_idx
    ON control.policy_test_case (created_by);
