ALTER TABLE metadata.entity_surface_operation
    ADD CONSTRAINT entity_surface_operation_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_operation_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_operation_surface_fk FOREIGN KEY (entity_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_operation_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_operation_section_fk FOREIGN KEY (entity_surface_section_id) REFERENCES metadata.entity_surface_section (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_operation_confirmation_fk FOREIGN KEY (confirmation_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_operation_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_operation_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_operation_rule
    ADD CONSTRAINT entity_operation_rule_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_rule_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_rule_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_rule_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_rule_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_flow
    ADD CONSTRAINT entity_flow_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_flow_entry_operation_fk FOREIGN KEY (entry_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_completion_operation_fk FOREIGN KEY (completion_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_flow_step
    ADD CONSTRAINT entity_flow_step_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_step_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_flow_step_flow_fk FOREIGN KEY (entity_flow_id) REFERENCES metadata.entity_flow (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_flow_step_surface_fk FOREIGN KEY (entity_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_step_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_flow_step_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_policy_binding
    ADD CONSTRAINT entity_policy_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_policy_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_policy_binding_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_policy_binding_policy_fk FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_policy_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_policy_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_field_policy_binding
    ADD CONSTRAINT entity_field_policy_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_policy_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_policy_binding_field_fk FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_policy_binding_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_policy_binding_policy_fk FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_policy_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_policy_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_contract_test_case
    ADD CONSTRAINT entity_contract_test_case_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_contract_test_case_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_contract_test_case_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_contract_test_case_flow_fk FOREIGN KEY (entity_flow_id) REFERENCES metadata.entity_flow (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_contract_test_case_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_contract_test_case_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
