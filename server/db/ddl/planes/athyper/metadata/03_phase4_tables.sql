-- Phase 4 composition graph. Flows reuse surfaces, policy bindings reference
-- canonical control policies, and test rows contain expectations but no results.
CREATE TABLE metadata.entity_surface_operation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_surface_id uuid NOT NULL, entity_operation_id uuid NOT NULL,
    entity_surface_section_id uuid, placement_key text NOT NULL,
    interaction_target metadata.entity_surface_operation_target_d NOT NULL DEFAULT 'secondary',
    selection_mode metadata.entity_surface_operation_selection_d NOT NULL DEFAULT 'none',
    position smallint NOT NULL, label_override text, icon_key text, presentation_variant text,
    confirmation_surface_id uuid, visibility_rule jsonb, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_surface_operation_pkey PRIMARY KEY (id),
    CONSTRAINT entity_surface_operation_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_surface_operation_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, placement_key),
    CONSTRAINT entity_surface_operation_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_surface_id, entity_surface_section_id, interaction_target, position),
    CONSTRAINT entity_surface_operation_key_chk CHECK (placement_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_surface_operation_position_chk CHECK (position >= 0),
    CONSTRAINT entity_surface_operation_label_chk CHECK (label_override IS NULL OR (btrim(label_override) <> '' AND length(label_override) <= 256)),
    CONSTRAINT entity_surface_operation_icon_chk CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_surface_operation_variant_chk CHECK (presentation_variant IS NULL OR presentation_variant ~ '^[a-z][a-z0-9_.-]{1,63}$'),
    CONSTRAINT entity_surface_operation_visibility_chk CHECK (visibility_rule IS NULL OR jsonb_typeof(visibility_rule) = 'object'),
    CONSTRAINT entity_surface_operation_selection_chk CHECK (interaction_target = 'selection' OR selection_mode = 'none'),
    CONSTRAINT entity_surface_operation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_operation_rule (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_operation_id uuid NOT NULL, rule_key text NOT NULL,
    priority smallint NOT NULL DEFAULT 100, decision metadata.entity_operation_rule_decision_d NOT NULL,
    plane_code text, lifecycle_state_code text, lifecycle_transition_code text, required_capability_code text,
    reason_code text, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_operation_rule_pkey PRIMARY KEY (id),
    CONSTRAINT entity_operation_rule_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_operation_rule_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_operation_id, rule_key),
    CONSTRAINT entity_operation_rule_priority_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_operation_id, priority),
    CONSTRAINT entity_operation_rule_key_chk CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_priority_chk CHECK (priority BETWEEN 0 AND 32767),
    CONSTRAINT entity_operation_rule_plane_chk CHECK (plane_code IS NULL OR plane_code IN ('athyper', 'neon', 'mesh')),
    CONSTRAINT entity_operation_rule_state_chk CHECK (lifecycle_state_code IS NULL OR lifecycle_state_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_transition_chk CHECK (lifecycle_transition_code IS NULL OR lifecycle_transition_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_capability_chk CHECK (required_capability_code IS NULL OR required_capability_code ~ '^[a-z][a-z0-9_.:-]{1,126}$'),
    CONSTRAINT entity_operation_rule_reason_chk CHECK (reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_operation_rule_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_flow (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, flow_key text NOT NULL, flow_kind metadata.entity_flow_kind_d NOT NULL,
    title text NOT NULL, description text, navigation_mode metadata.entity_flow_navigation_d NOT NULL DEFAULT 'linear',
    entry_operation_id uuid, completion_operation_id uuid, allow_draft_resume boolean NOT NULL DEFAULT true,
    status metadata.entity_member_status_d NOT NULL DEFAULT 'active', replacement_flow_key text,
    deprecated_since_release_no bigint, planned_removal_release_no bigint,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_flow_pkey PRIMARY KEY (id),
    CONSTRAINT entity_flow_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_flow_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, flow_key),
    CONSTRAINT entity_flow_key_chk CHECK (flow_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_flow_title_chk CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_flow_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_flow_replacement_chk CHECK (replacement_flow_key IS NULL OR replacement_flow_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_flow_deprecation_chk CHECK ((status = 'active' AND replacement_flow_key IS NULL AND deprecated_since_release_no IS NULL AND planned_removal_release_no IS NULL) OR (status = 'deprecated' AND deprecated_since_release_no >= 1 AND (planned_removal_release_no IS NULL OR planned_removal_release_no > deprecated_since_release_no))),
    CONSTRAINT entity_flow_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_flow_step (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_flow_id uuid NOT NULL, entity_surface_id uuid NOT NULL,
    step_key text NOT NULL, position smallint NOT NULL, title_override text, description text,
    entry_condition jsonb, completion_condition jsonb, is_optional boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_flow_step_pkey PRIMARY KEY (id),
    CONSTRAINT entity_flow_step_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_flow_step_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_flow_id, step_key),
    CONSTRAINT entity_flow_step_position_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_flow_id, position),
    CONSTRAINT entity_flow_step_key_chk CHECK (step_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_flow_step_position_chk CHECK (position >= 0),
    CONSTRAINT entity_flow_step_title_chk CHECK (title_override IS NULL OR (btrim(title_override) <> '' AND length(title_override) <= 256)),
    CONSTRAINT entity_flow_step_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_flow_step_entry_chk CHECK (entry_condition IS NULL OR jsonb_typeof(entry_condition) = 'object'),
    CONSTRAINT entity_flow_step_completion_chk CHECK (completion_condition IS NULL OR jsonb_typeof(completion_condition) = 'object'),
    CONSTRAINT entity_flow_step_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_policy_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_operation_id uuid, policy_definition_id uuid NOT NULL,
    binding_key text NOT NULL, binding_stage metadata.entity_policy_binding_stage_d NOT NULL,
    enforcement metadata.entity_policy_enforcement_d NOT NULL DEFAULT 'enforce', priority smallint NOT NULL DEFAULT 100,
    input_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_policy_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_policy_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_policy_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_policy_binding_order_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, entity_operation_id, binding_stage, priority),
    CONSTRAINT entity_policy_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_policy_binding_priority_chk CHECK (priority BETWEEN 0 AND 32767),
    CONSTRAINT entity_policy_binding_mapping_chk CHECK (jsonb_typeof(input_mapping) = 'object'),
    CONSTRAINT entity_policy_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_field_policy_binding (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, entity_field_id uuid NOT NULL, entity_operation_id uuid,
    policy_definition_id uuid NOT NULL, binding_key text NOT NULL,
    binding_stage metadata.entity_policy_binding_stage_d NOT NULL,
    enforcement metadata.entity_policy_enforcement_d NOT NULL DEFAULT 'enforce', priority smallint NOT NULL DEFAULT 100,
    input_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_field_policy_binding_pkey PRIMARY KEY (id),
    CONSTRAINT entity_field_policy_binding_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_field_policy_binding_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, binding_key),
    CONSTRAINT entity_field_policy_binding_order_uq UNIQUE NULLS NOT DISTINCT (tenant_id, entity_field_id, entity_operation_id, binding_stage, priority),
    CONSTRAINT entity_field_policy_binding_key_chk CHECK (binding_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_field_policy_binding_priority_chk CHECK (priority BETWEEN 0 AND 32767),
    CONSTRAINT entity_field_policy_binding_mapping_chk CHECK (jsonb_typeof(input_mapping) = 'object'),
    CONSTRAINT entity_field_policy_binding_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE metadata.entity_contract_test_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid, entity_id uuid NOT NULL,
    change_set_id uuid NOT NULL, test_key text NOT NULL, test_kind metadata.entity_contract_test_kind_d NOT NULL,
    title text NOT NULL, description text, target_plane text, entity_operation_id uuid, entity_flow_id uuid,
    input_context jsonb NOT NULL DEFAULT '{}'::jsonb,
    expected_outcome metadata.entity_contract_test_outcome_d NOT NULL DEFAULT 'pass',
    expected_diagnostic_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
    status metadata.entity_member_status_d NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT entity_contract_test_case_pkey PRIMARY KEY (id),
    CONSTRAINT entity_contract_test_case_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_contract_test_case_key_uq UNIQUE NULLS NOT DISTINCT (tenant_id, change_set_id, test_key),
    CONSTRAINT entity_contract_test_case_key_chk CHECK (test_key ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_contract_test_case_title_chk CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_contract_test_case_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT entity_contract_test_case_plane_chk CHECK (target_plane IS NULL OR target_plane IN ('athyper', 'neon', 'mesh')),
    CONSTRAINT entity_contract_test_case_input_chk CHECK (jsonb_typeof(input_context) = 'object'),
    CONSTRAINT entity_contract_test_case_diagnostics_chk CHECK (array_position(expected_diagnostic_codes, NULL) IS NULL),
    CONSTRAINT entity_contract_test_case_target_chk CHECK (test_kind = 'operation' OR entity_operation_id IS NULL),
    CONSTRAINT entity_contract_test_case_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity_flow_step IS 'Flow orchestration step referencing a reusable surface; it owns no field or layout graph.';
COMMENT ON TABLE metadata.entity_policy_binding IS 'Entity/operation composition reference to canonical control.policy_definition; no policy body is duplicated.';
COMMENT ON TABLE metadata.entity_contract_test_case IS 'Version-aware contract fixture and expectation. Execution results are immutable artifacts outside this table.';
