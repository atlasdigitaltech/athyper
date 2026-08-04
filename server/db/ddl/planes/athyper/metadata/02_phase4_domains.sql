CREATE DOMAIN metadata.entity_surface_operation_target_d AS text
    CHECK (VALUE IN ('primary', 'secondary', 'toolbar', 'row', 'selection', 'overflow'));

CREATE DOMAIN metadata.entity_surface_operation_selection_d AS text
    CHECK (VALUE IN ('none', 'single', 'multiple'));

CREATE DOMAIN metadata.entity_operation_rule_decision_d AS text
    CHECK (VALUE IN ('allow', 'deny'));

CREATE DOMAIN metadata.entity_flow_kind_d AS text
    CHECK (VALUE IN ('create', 'edit', 'review', 'execute'));

CREATE DOMAIN metadata.entity_flow_navigation_d AS text
    CHECK (VALUE IN ('linear', 'free'));

CREATE DOMAIN metadata.entity_policy_binding_stage_d AS text
    CHECK (VALUE IN ('authorization', 'precondition', 'validation', 'postcondition', 'masking'));

CREATE DOMAIN metadata.entity_policy_enforcement_d AS text
    CHECK (VALUE IN ('enforce', 'warn', 'observe'));

CREATE DOMAIN metadata.entity_contract_test_kind_d AS text
    CHECK (VALUE IN ('validation', 'compilation', 'compatibility', 'operation'));

CREATE DOMAIN metadata.entity_contract_test_outcome_d AS text
    CHECK (VALUE IN ('pass', 'fail', 'warning'));
