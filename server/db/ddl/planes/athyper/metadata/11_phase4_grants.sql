REVOKE ALL ON metadata.entity_surface_operation, metadata.entity_operation_rule,
    metadata.entity_flow, metadata.entity_flow_step, metadata.entity_policy_binding,
    metadata.entity_field_policy_binding, metadata.entity_contract_test_case FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_surface_operation, metadata.entity_operation_rule,
    metadata.entity_flow, metadata.entity_flow_step, metadata.entity_policy_binding,
    metadata.entity_field_policy_binding, metadata.entity_contract_test_case TO athyperapp;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON metadata.entity_surface_operation, metadata.entity_operation_rule,
            metadata.entity_flow, metadata.entity_flow_step, metadata.entity_policy_binding,
            metadata.entity_field_policy_binding, metadata.entity_contract_test_case TO athyperadmin;
    END IF;
END $$;
