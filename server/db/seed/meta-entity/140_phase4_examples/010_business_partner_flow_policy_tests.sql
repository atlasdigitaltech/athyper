-- seed-pack-version: p4.0-v1
-- Phase 4 extends only the independent editable Business Partner example.
DO $phase4_business_partner$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_entity_id uuid := pg_temp.meta_entity_seed_id('entity:business_partner');
    v_change_set_id uuid := pg_temp.meta_entity_seed_id('change-set:business_partner:p2_7_studio_draft');
    v_surface_id uuid := pg_temp.meta_entity_seed_id('surface:business_partner:p2_7_studio_draft:editor');
    v_identity_section_id uuid := pg_temp.meta_entity_seed_id('surface-section:business_partner:p2_7_studio_draft:editor:identity');
    v_create_operation_id uuid := pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:create');
    v_update_operation_id uuid := pg_temp.meta_entity_seed_id('operation:business_partner:p2_7_studio_draft:update');
    v_flow_id uuid := pg_temp.meta_entity_seed_id('flow:business_partner:p2_7_studio_draft:maintain');
    v_write_policy_id uuid := pg_temp.meta_entity_seed_id('policy:business_partner:write_guard');
    v_field_policy_id uuid := pg_temp.meta_entity_seed_id('policy:business_partner:website_validation');
    v_website_field_id uuid;
    v_lock_version bigint;
BEGIN
    IF EXISTS (SELECT 1 FROM metadata.entity_flow WHERE id = v_flow_id) THEN RETURN; END IF;

    SELECT id INTO v_website_field_id FROM metadata.entity_field
     WHERE change_set_id = v_change_set_id AND field_key = 'website_url';
    IF v_website_field_id IS NULL THEN RAISE EXCEPTION '[meta-entity P4] website field is missing'; END IF;

    INSERT INTO control.policy_definition (id, tenant_id, entity_type, name, description, priority, evaluation_mode, status, created_by)
    VALUES
      (v_write_policy_id, NULL, 'business_partner', 'Business Partner write guard', 'Canonical authorization and validation policy referenced by Entity operations.', 100, 'all', 'active', v_actor),
      (v_field_policy_id, NULL, 'business_partner.website_url', 'Business Partner website validation', 'Canonical field policy referenced without embedding its rule body.', 110, 'all', 'active', v_actor)
    ON CONFLICT (id) DO NOTHING;

    SELECT lock_version INTO v_lock_version FROM metadata.entity_change_set
     WHERE id = v_change_set_id AND status = 'draft';
    IF v_lock_version IS NULL THEN RAISE EXCEPTION '[meta-entity P4] editable Business Partner draft is missing'; END IF;
    PERFORM metadata.fn_advance_entity_change_set(v_change_set_id, v_lock_version, v_actor);

    INSERT INTO metadata.entity_surface_operation (
      id, tenant_id, entity_id, change_set_id, entity_surface_id, entity_operation_id,
      entity_surface_section_id, placement_key, interaction_target, position,
      label_override, icon_key, presentation_variant, created_by
    ) VALUES
      (pg_temp.meta_entity_seed_id('surface-operation:business_partner:editor:create'), NULL, v_entity_id, v_change_set_id,
       v_surface_id, v_create_operation_id, v_identity_section_id, 'create_primary', 'primary', 0,
       'Create Business Partner', 'plus', 'primary', v_actor),
      (pg_temp.meta_entity_seed_id('surface-operation:business_partner:editor:update'), NULL, v_entity_id, v_change_set_id,
       v_surface_id, v_update_operation_id, v_identity_section_id, 'update_secondary', 'secondary', 0,
       'Save changes', 'save', 'secondary', v_actor);

    INSERT INTO metadata.entity_operation_rule (
      id, tenant_id, entity_id, change_set_id, entity_operation_id, rule_key, priority,
      decision, plane_code, lifecycle_state_code, required_capability_code, reason_code, created_by
    ) VALUES
      (pg_temp.meta_entity_seed_id('operation-rule:business_partner:create:neon'), NULL, v_entity_id, v_change_set_id,
       v_create_operation_id, 'neon_create', 100, 'allow', 'neon', 'draft', 'business_partner.write', 'create_allowed', v_actor),
      (pg_temp.meta_entity_seed_id('operation-rule:business_partner:update:neon'), NULL, v_entity_id, v_change_set_id,
       v_update_operation_id, 'neon_update', 100, 'allow', 'neon', 'active', 'business_partner.write', 'update_allowed', v_actor);

    INSERT INTO metadata.entity_flow (
      id, tenant_id, entity_id, change_set_id, flow_key, flow_kind, title, description,
      navigation_mode, entry_operation_id, completion_operation_id, allow_draft_resume, created_by
    ) VALUES (v_flow_id, NULL, v_entity_id, v_change_set_id, 'maintain', 'edit',
      'Maintain Business Partner', 'Single-step flow reusing the canonical editor surface.',
      'linear', v_update_operation_id, v_update_operation_id, true, v_actor);

    INSERT INTO metadata.entity_flow_step (
      id, tenant_id, entity_id, change_set_id, entity_flow_id, entity_surface_id,
      step_key, position, title_override, is_optional, created_by
    ) VALUES (pg_temp.meta_entity_seed_id('flow-step:business_partner:maintain:details'), NULL,
      v_entity_id, v_change_set_id, v_flow_id, v_surface_id, 'details', 0,
      'Business Partner details', false, v_actor);

    INSERT INTO metadata.entity_policy_binding (
      id, tenant_id, entity_id, change_set_id, entity_operation_id, policy_definition_id,
      binding_key, binding_stage, enforcement, priority, input_mapping, created_by
    ) VALUES (pg_temp.meta_entity_seed_id('policy-binding:business_partner:update:write_guard'), NULL,
      v_entity_id, v_change_set_id, v_update_operation_id, v_write_policy_id,
      'update_write_guard', 'authorization', 'enforce', 100,
      '{"actor":"$.actor","record":"$.input"}'::jsonb, v_actor);

    INSERT INTO metadata.entity_field_policy_binding (
      id, tenant_id, entity_id, change_set_id, entity_field_id, entity_operation_id,
      policy_definition_id, binding_key, binding_stage, enforcement, priority, input_mapping, created_by
    ) VALUES (pg_temp.meta_entity_seed_id('field-policy-binding:business_partner:website_url'), NULL,
      v_entity_id, v_change_set_id, v_website_field_id, v_update_operation_id, v_field_policy_id,
      'website_validation', 'validation', 'enforce', 100, '{"value":"$.input.website_url"}'::jsonb, v_actor);

    INSERT INTO metadata.entity_contract_test_case (
      id, tenant_id, entity_id, change_set_id, test_key, test_kind, title, target_plane,
      entity_operation_id, entity_flow_id, input_context, expected_outcome, expected_diagnostic_codes, created_by
    ) VALUES
      (pg_temp.meta_entity_seed_id('contract-test:business_partner:valid_minimum'), NULL, v_entity_id, v_change_set_id,
       'valid_minimum', 'validation', 'Minimum valid Business Partner', 'neon', NULL, v_flow_id,
       '{"record":{"code":"BP-001","name":"Example Partner"}}'::jsonb, 'pass', ARRAY[]::text[], v_actor),
      (pg_temp.meta_entity_seed_id('contract-test:business_partner:missing_name'), NULL, v_entity_id, v_change_set_id,
       'missing_name', 'validation', 'Missing required name is rejected', 'neon', NULL, v_flow_id,
       '{"record":{"code":"BP-002"}}'::jsonb, 'fail', ARRAY['field.name.required'], v_actor),
      (pg_temp.meta_entity_seed_id('contract-test:business_partner:update_operation'), NULL, v_entity_id, v_change_set_id,
       'update_operation', 'operation', 'Update operation composes policy and flow', 'neon', v_update_operation_id, v_flow_id,
       '{"actor":{"capabilities":["business_partner.write"]},"input":{"website_url":"https://example.com"}}'::jsonb,
       'pass', ARRAY[]::text[], v_actor);

    SET CONSTRAINTS ALL IMMEDIATE;
    PERFORM metadata.fn_validate_entity_graph(v_change_set_id);
    SET CONSTRAINTS ALL DEFERRED;
END
$phase4_business_partner$;
