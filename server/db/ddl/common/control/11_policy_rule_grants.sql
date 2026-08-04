REVOKE ALL ON control.policy_rule, control.policy_test_case FROM PUBLIC;
GRANT SELECT ON control.policy_rule, control.policy_test_case TO athyperapp;
GRANT ALL PRIVILEGES ON control.policy_rule, control.policy_test_case TO athyperadmin;
