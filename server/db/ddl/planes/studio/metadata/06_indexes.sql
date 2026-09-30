CREATE INDEX ix_metadata_entity_module_status
    ON metadata.entity (module_id, status, entity_code);

CREATE INDEX ix_metadata_entity_tenant_class
    ON metadata.entity (tenant_id, entity_class, status);

CREATE UNIQUE INDEX ux_entity_change_set_open_branch
    ON metadata.entity_change_set (tenant_id, entity_id, branch_code)
    NULLS NOT DISTINCT
    WHERE status IN ('draft', 'in_review', 'rejected');

CREATE INDEX ix_entity_change_set_entity_status
    ON metadata.entity_change_set (tenant_id, entity_id, status, updated_at DESC NULLS LAST);

CREATE INDEX ix_entity_change_set_parent
    ON metadata.entity_change_set (parent_change_set_id)
    WHERE parent_change_set_id IS NOT NULL;

CREATE INDEX ix_entity_change_set_base_release
    ON metadata.entity_change_set (base_release_id)
    WHERE base_release_id IS NOT NULL;

CREATE UNIQUE INDEX ux_entity_release_successor
    ON metadata.entity_release (supersedes_release_id)
    WHERE supersedes_release_id IS NOT NULL;

CREATE INDEX ix_entity_release_current
    ON metadata.entity_release (tenant_id, entity_id, release_no DESC);

CREATE INDEX ix_entity_release_change_set
    ON metadata.entity_release (change_set_id);

CREATE INDEX ix_entity_release_revision
    ON metadata.entity_release (revision_id);

CREATE INDEX ix_entity_release_audit_event
    ON metadata.entity_release (audit_event_id)
    WHERE audit_event_id IS NOT NULL;

CREATE INDEX ix_entity_runtime_profile_entity
    ON metadata.entity_runtime_profile (tenant_id, entity_id, change_set_id);

CREATE INDEX ix_entity_field_change_set_status
    ON metadata.entity_field (tenant_id, change_set_id, status, field_key);

CREATE INDEX ix_entity_field_storage_path
    ON metadata.entity_field (tenant_id, change_set_id, storage_path)
    WHERE storage_path IS NOT NULL;

CREATE INDEX ix_entity_field_replacement
    ON metadata.entity_field (tenant_id, change_set_id, replacement_field_key)
    WHERE replacement_field_key IS NOT NULL;

CREATE UNIQUE INDEX ux_entity_key_active_primary
    ON metadata.entity_key (tenant_id, change_set_id)
    NULLS NOT DISTINCT
    WHERE key_kind = 'primary' AND status = 'active';

CREATE INDEX ix_entity_key_change_set
    ON metadata.entity_key (tenant_id, change_set_id, status, key_kind, key_key);

CREATE INDEX ix_entity_key_field_field
    ON metadata.entity_key_field (tenant_id, entity_field_id, entity_key_id);

CREATE UNIQUE INDEX ux_entity_search_profile_default
    ON metadata.entity_search_profile (tenant_id, change_set_id)
    NULLS NOT DISTINCT
    WHERE is_default AND status = 'active';

CREATE INDEX ix_entity_search_profile_change_set
    ON metadata.entity_search_profile (tenant_id, change_set_id, status, search_key);

CREATE INDEX ix_entity_search_field_field
    ON metadata.entity_search_field (tenant_id, entity_field_id, entity_search_profile_id);

CREATE INDEX ix_entity_relation_change_set
    ON metadata.entity_relation (tenant_id, change_set_id, status, relation_key);

CREATE INDEX ix_entity_relation_inverse
    ON metadata.entity_relation (tenant_id, change_set_id, inverse_relation_key)
    WHERE inverse_relation_key IS NOT NULL;

CREATE INDEX ix_entity_relation_target_entity
    ON metadata.entity_relation_target (tenant_id, target_entity_id, target_key_key);

CREATE UNIQUE INDEX ux_entity_relation_target_default
    ON metadata.entity_relation_target (tenant_id, entity_relation_id)
    NULLS NOT DISTINCT
    WHERE is_default;

CREATE INDEX ix_entity_relation_field_source
    ON metadata.entity_relation_field (tenant_id, source_field_id, entity_relation_target_id);

CREATE INDEX ix_entity_surface_change_set ON metadata.entity_surface (tenant_id, change_set_id, status, surface_kind, surface_key);
CREATE UNIQUE INDEX ux_entity_surface_default_kind ON metadata.entity_surface (tenant_id, change_set_id, surface_kind) NULLS NOT DISTINCT WHERE is_default AND status = 'active';
CREATE INDEX ix_entity_surface_replacement ON metadata.entity_surface (tenant_id, change_set_id, replacement_surface_key) WHERE replacement_surface_key IS NOT NULL;
CREATE INDEX ix_entity_surface_section_tree ON metadata.entity_surface_section (tenant_id, entity_surface_id, parent_section_id, position);
CREATE INDEX ix_entity_surface_field_binding_field ON metadata.entity_surface_field_binding (tenant_id, entity_field_id, entity_surface_id);
CREATE INDEX ix_entity_surface_component_binding_component ON metadata.entity_surface_component_binding(tenant_id,component_surface_id,entity_surface_id);
CREATE INDEX ix_entity_operation_change_set ON metadata.entity_operation (tenant_id, change_set_id, status, operation_kind, operation_key);
CREATE INDEX ix_entity_operation_legacy_permission_code ON metadata.entity_operation (tenant_id, permission_code, status)
    WHERE permission_code IS NOT NULL;
CREATE INDEX ix_entity_operation_permission_binding_code
    ON metadata.entity_operation_permission (target_plane, permission_code, permission_kind, status);
CREATE INDEX ix_entity_operation_permission_binding_change_set
    ON metadata.entity_operation_permission (tenant_id, change_set_id, entity_operation_id, status);
CREATE INDEX ix_entity_operation_surfaces ON metadata.entity_operation (tenant_id, change_set_id, input_surface_key, result_surface_key);

CREATE INDEX entity_surface_operation_change_set_ix ON metadata.entity_surface_operation (change_set_id, entity_surface_id, interaction_target, position);
CREATE INDEX entity_surface_operation_operation_ix ON metadata.entity_surface_operation (change_set_id, entity_operation_id);
CREATE INDEX entity_operation_rule_change_set_ix ON metadata.entity_operation_rule (change_set_id, entity_operation_id, priority);
CREATE INDEX entity_operation_rule_selectors_ix ON metadata.entity_operation_rule (change_set_id, plane_code, lifecycle_state_code, lifecycle_transition_code);
CREATE INDEX entity_flow_change_set_ix ON metadata.entity_flow (change_set_id, flow_kind, flow_key);
CREATE INDEX entity_flow_step_flow_ix ON metadata.entity_flow_step (entity_flow_id, position);
CREATE INDEX entity_flow_step_surface_ix ON metadata.entity_flow_step (change_set_id, entity_surface_id);
CREATE INDEX entity_policy_binding_policy_ix ON metadata.entity_policy_binding (policy_definition_id, change_set_id);
CREATE INDEX entity_policy_binding_operation_ix ON metadata.entity_policy_binding (change_set_id, entity_operation_id, binding_stage, priority);
CREATE INDEX entity_field_policy_binding_policy_ix ON metadata.entity_field_policy_binding (policy_definition_id, change_set_id);
CREATE INDEX entity_field_policy_binding_field_ix ON metadata.entity_field_policy_binding (change_set_id, entity_field_id, binding_stage, priority);
CREATE INDEX entity_contract_test_case_change_set_ix ON metadata.entity_contract_test_case (change_set_id, test_kind, test_key);
CREATE INDEX entity_contract_test_case_operation_ix ON metadata.entity_contract_test_case (change_set_id, entity_operation_id) WHERE entity_operation_id IS NOT NULL;
CREATE INDEX entity_contract_test_case_flow_ix ON metadata.entity_contract_test_case (change_set_id, entity_flow_id) WHERE entity_flow_id IS NOT NULL;

CREATE INDEX entity_lifecycle_binding_resolve_ix ON metadata.entity_lifecycle_binding (change_set_id,target_plane,lifecycle_code,lifecycle_revision) WHERE status='active';
CREATE INDEX entity_lifecycle_operation_binding_resolve_ix ON metadata.entity_lifecycle_operation_binding (entity_lifecycle_binding_id,transition_code) WHERE status='active';

CREATE INDEX entity_numbering_binding_resolve_ix
    ON metadata.entity_numbering_binding (change_set_id,target_plane,policy_code,policy_revision)
    WHERE status = 'active';
CREATE INDEX entity_numbering_binding_operation_ix
    ON metadata.entity_numbering_binding (change_set_id,entity_operation_id)
    WHERE entity_operation_id IS NOT NULL AND status = 'active';

CREATE INDEX ix_entity_operation_scope_binding_change_set
    ON metadata.entity_operation_scope_binding
       (tenant_id, change_set_id, target_plane, status);

CREATE INDEX ix_entity_operation_scope_binding_operation
    ON metadata.entity_operation_scope_binding
       (tenant_id, entity_operation_id, target_plane, scope_kind);
CREATE INDEX entity_field_pii_inventory_idx
    ON metadata.entity_field (tenant_id, data_classification, entity_id, field_key)
    WHERE data_classification IN ('pii','sensitive_pii') AND status = 'active';
