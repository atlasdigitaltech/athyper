ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_module_fk
    FOREIGN KEY (module_id)
    REFERENCES control.module (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_status_changed_by_fk
    FOREIGN KEY (status_changed_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity
    ADD CONSTRAINT metadata_entity_updated_by_fk
    FOREIGN KEY (updated_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_entity_fk
    FOREIGN KEY (entity_id)
    REFERENCES metadata.entity (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_parent_fk
    FOREIGN KEY (parent_change_set_id)
    REFERENCES metadata.entity_change_set (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_base_release_fk
    FOREIGN KEY (base_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_submitted_by_fk
    FOREIGN KEY (submitted_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_reviewed_by_fk
    FOREIGN KEY (reviewed_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_approved_by_fk
    FOREIGN KEY (approved_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_rejected_by_fk
    FOREIGN KEY (rejected_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_published_by_fk
    FOREIGN KEY (published_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_status_changed_by_fk
    FOREIGN KEY (status_changed_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_created_by_fk
    FOREIGN KEY (created_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_change_set
    ADD CONSTRAINT entity_change_set_updated_by_fk
    FOREIGN KEY (updated_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_entity_fk
    FOREIGN KEY (entity_id)
    REFERENCES metadata.entity (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_change_set_fk
    FOREIGN KEY (change_set_id)
    REFERENCES metadata.entity_change_set (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_revision_fk
    FOREIGN KEY (revision_id)
    REFERENCES snapshot.entity_contract_revision (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_supersedes_fk
    FOREIGN KEY (supersedes_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_rollback_of_fk
    FOREIGN KEY (rollback_of_release_id)
    REFERENCES metadata.entity_release (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_release
    ADD CONSTRAINT entity_release_published_by_fk
    FOREIGN KEY (published_by)
    REFERENCES master.principal (id)
    ON DELETE RESTRICT;

ALTER TABLE metadata.entity_class_profile
    ADD CONSTRAINT entity_class_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_runtime_profile
    ADD CONSTRAINT entity_runtime_profile_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_runtime_profile_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_runtime_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_runtime_profile_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_field
    ADD CONSTRAINT entity_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_key
    ADD CONSTRAINT entity_key_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_key_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_key_field
    ADD CONSTRAINT entity_key_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_key_field_key_fk
    FOREIGN KEY (entity_key_id) REFERENCES metadata.entity_key (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_key_field_field_fk
    FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_key_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_search_profile
    ADD CONSTRAINT entity_search_profile_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_profile_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_search_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_profile_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_search_field
    ADD CONSTRAINT entity_search_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_search_field_profile_fk
    FOREIGN KEY (entity_search_profile_id) REFERENCES metadata.entity_search_profile (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_search_field_field_fk
    FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_search_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_relation
    ADD CONSTRAINT entity_relation_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_relation_target
    ADD CONSTRAINT entity_relation_target_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_target_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_target_relation_fk
    FOREIGN KEY (entity_relation_id) REFERENCES metadata.entity_relation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_target_target_entity_fk
    FOREIGN KEY (target_entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_target_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_target_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_relation_field
    ADD CONSTRAINT entity_relation_field_entity_fk
    FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_field_change_set_fk
    FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_field_target_fk
    FOREIGN KEY (entity_relation_target_id) REFERENCES metadata.entity_relation_target (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_relation_field_source_field_fk
    FOREIGN KEY (source_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_field_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_relation_field_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_surface
    ADD CONSTRAINT entity_surface_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_surface_section
    ADD CONSTRAINT entity_surface_section_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_section_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_section_surface_fk FOREIGN KEY (entity_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_section_parent_fk FOREIGN KEY (parent_section_id) REFERENCES metadata.entity_surface_section (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT entity_surface_section_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_section_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_surface_field_binding
    ADD CONSTRAINT entity_surface_field_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_field_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_field_binding_surface_fk FOREIGN KEY (entity_surface_id) REFERENCES metadata.entity_surface (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_field_binding_section_fk FOREIGN KEY (entity_surface_section_id) REFERENCES metadata.entity_surface_section (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_field_binding_field_fk FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_field_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_field_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_surface_component_binding
    ADD CONSTRAINT entity_surface_component_binding_entity_fk FOREIGN KEY(entity_id) REFERENCES metadata.entity(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_component_binding_change_set_fk FOREIGN KEY(change_set_id) REFERENCES metadata.entity_change_set(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_component_binding_surface_fk FOREIGN KEY(entity_surface_id) REFERENCES metadata.entity_surface(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_component_binding_section_fk FOREIGN KEY(entity_surface_section_id) REFERENCES metadata.entity_surface_section(id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_surface_component_binding_component_fk FOREIGN KEY(component_surface_id) REFERENCES metadata.entity_surface(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_component_binding_created_by_fk FOREIGN KEY(created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_surface_component_binding_updated_by_fk FOREIGN KEY(updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_operation
    ADD CONSTRAINT entity_operation_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_operation_permission
    ADD CONSTRAINT entity_operation_permission_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_permission_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_permission_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_permission_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_permission_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

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

ALTER TABLE metadata.entity_lifecycle_binding
    ADD CONSTRAINT entity_lifecycle_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_lifecycle_binding_field_fk FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_lifecycle_operation_binding
    ADD CONSTRAINT entity_lifecycle_operation_binding_entity_fk FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_operation_binding_change_set_fk FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_lifecycle_operation_binding_binding_fk FOREIGN KEY (entity_lifecycle_binding_id) REFERENCES metadata.entity_lifecycle_binding (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_lifecycle_operation_binding_operation_fk FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_operation_binding_created_by_fk FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_lifecycle_operation_binding_updated_by_fk FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_numbering_binding
    ADD CONSTRAINT entity_numbering_binding_entity_fk
        FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_binding_change_set_fk
        FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_numbering_binding_field_fk
        FOREIGN KEY (entity_field_id) REFERENCES metadata.entity_field (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_binding_operation_fk
        FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_binding_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_numbering_binding_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE metadata.entity_operation_scope_binding
    ADD CONSTRAINT entity_operation_scope_binding_entity_fk
        FOREIGN KEY (entity_id) REFERENCES metadata.entity (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_scope_binding_change_set_fk
        FOREIGN KEY (change_set_id) REFERENCES metadata.entity_change_set (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_scope_binding_operation_fk
        FOREIGN KEY (entity_operation_id) REFERENCES metadata.entity_operation (id) ON DELETE CASCADE,
    ADD CONSTRAINT entity_operation_scope_binding_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT entity_operation_scope_binding_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
