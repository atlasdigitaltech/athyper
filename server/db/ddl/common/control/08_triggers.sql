DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'workspace', 'module', 'workspace_module', 'subscription_plan_module'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_platform_catalog_identity()',
            v_table || '_identity_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER lookup_domain_updated_at
  BEFORE UPDATE ON control.lookup_domain
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER lookup_domain_status_changed
  BEFORE UPDATE ON control.lookup_domain
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER lookup_value_updated_at
  BEFORE UPDATE ON control.lookup_value
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER lookup_value_status_changed
  BEFORE UPDATE ON control.lookup_value
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER lookup_value_extensibility
  BEFORE INSERT OR UPDATE OF tenant_id, domain_code, is_system
  ON control.lookup_value
  FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_lookup_extensibility();

CREATE TRIGGER connector_type_updated_at
BEFORE UPDATE ON control.connector_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'connector_instance', 'integration_endpoint', 'webhook_subscription',
        'cycle_type', 'cycle_phase', 'cycle_task_category', 'cycle_task_template',
        'cycle_task_dependency', 'cycle_cross_dependency', 'cycle_carryforward_rule'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity()',
            v_table || '_identity_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'connector_instance', 'integration_endpoint', 'webhook_subscription',
        'cycle_type', 'cycle_phase', 'cycle_task_category', 'cycle_task_template'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER cycle_task_dependency_acyclic
BEFORE INSERT OR UPDATE OF predecessor_template_id, successor_template_id, status
ON control.cycle_task_dependency
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION control.trg_reject_cycle_dependency_cycle();

CREATE TRIGGER cycle_type_domain_validate
BEFORE INSERT OR UPDATE OF tenant_id, domain_code
ON control.cycle_type
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_cycle_domain();

CREATE TRIGGER cycle_template_revision_immutable
BEFORE UPDATE OR DELETE ON control.cycle_template_revision
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_cycle_template_revision_mutation();

CREATE TRIGGER bank_account_validation_rule_updated_at
BEFORE UPDATE ON control.bank_account_validation_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER connector_instance_reject_secret_json
BEFORE INSERT OR UPDATE OF config ON control.connector_instance
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_secret_shaped_json();

CREATE TRIGGER integration_endpoint_reject_secret_headers
BEFORE INSERT OR UPDATE OF headers ON control.integration_endpoint
FOR EACH ROW EXECUTE FUNCTION control.trg_reject_secret_shaped_json();

CREATE TRIGGER usage_metric_catalog_updated_at
BEFORE UPDATE ON control.usage_metric_catalog
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER usage_metric_catalog_guard
BEFORE UPDATE ON control.usage_metric_catalog
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_usage_limit_identity();

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'subscription_plan_usage_limit', 'tenant_usage_limit_override'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF usage_metric_id, dimension_code ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_validate_usage_limit_dimension()',
            v_table || '_dimension_validate', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_usage_limit_identity()',
            v_table || '_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'feature_flag_catalog', 'feature_flag_override',
        'parameter_definition', 'tenant_parameter_value'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION control.trg_guard_feature_parameter_identity()',
            v_table || '_guard', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_updated_at', v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON control.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table || '_status_changed', v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER parameter_definition_validate
BEFORE INSERT OR UPDATE OF value_type, default_value, min_value, max_value, allowed_values
ON control.parameter_definition
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_parameter_definition();

CREATE TRIGGER tenant_parameter_value_validate
BEFORE INSERT OR UPDATE OF parameter_definition_id, value
ON control.tenant_parameter_value
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tenant_parameter_value();

CREATE TRIGGER cron_schedule_updated_at
BEFORE UPDATE ON control.cron_schedule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_provider_updated_at
BEFORE UPDATE ON control.notification_provider
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_template_updated_at
BEFORE UPDATE ON control.notification_template
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER notification_routing_rule_updated_at
BEFORE UPDATE ON control.notification_routing_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER numbering_policy_10_validate
BEFORE INSERT OR UPDATE ON control.numbering_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_numbering_policy();

CREATE TRIGGER numbering_policy_20_guard
BEFORE UPDATE ON control.numbering_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_numbering_policy();

CREATE TRIGGER numbering_policy_90_updated_at
BEFORE UPDATE ON control.numbering_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER policy_definition_updated_at
    BEFORE UPDATE ON control.policy_definition
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER policy_rule_updated_at
    BEFORE UPDATE ON control.policy_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER policy_test_case_updated_at
    BEFORE UPDATE ON control.policy_test_case
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER policy_test_case_status_changed
    BEFORE UPDATE OF status ON control.policy_test_case
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER policy_definition_published_immutable BEFORE UPDATE OR DELETE ON control.policy_definition
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_protect_published_policy_revision();
CREATE TRIGGER policy_rule_published_immutable BEFORE UPDATE OR DELETE ON control.policy_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_protect_published_policy_revision();
CREATE TRIGGER policy_test_case_published_immutable BEFORE UPDATE OR DELETE ON control.policy_test_case
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_protect_published_policy_revision();

CREATE TRIGGER trg_rounding_rule_00_created_by
BEFORE INSERT ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_rounding_rule_10_status
BEFORE UPDATE OF status ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_rounding_rule_20_guard
BEFORE UPDATE OR DELETE ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_rounding_rule();

CREATE TRIGGER trg_rounding_rule_90_updated
BEFORE UPDATE ON control.rounding_rule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_rounding_context_00_created_by
BEFORE INSERT ON control.rounding_context
FOR EACH ROW EXECUTE FUNCTION master.trg_set_master_created_by();

CREATE TRIGGER trg_rounding_context_90_updated
BEFORE UPDATE ON control.rounding_context
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER subscription_plan_entitlement_version BEFORE UPDATE ON control.subscription_plan
FOR EACH ROW EXECUTE FUNCTION control.trg_version_entitlement_plan();
DO $$ DECLARE v_table text; BEGIN
    FOREACH v_table IN ARRAY ARRAY['subscription_plan_module','subscription_plan_usage_limit','module','usage_metric_catalog'] LOOP
        EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON control.%I FOR EACH ROW EXECUTE FUNCTION control.trg_version_entitlement_plan_components()', v_table || '_entitlement_version', v_table);
    END LOOP;
END $$;
CREATE TRIGGER tenant_module_entitlement_override_guard BEFORE UPDATE ON control.tenant_module_entitlement_override
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_module_entitlement_override();

CREATE TRIGGER feature_flag_override_identity_version BEFORE UPDATE ON control.feature_flag_override
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_feature_override();

CREATE TRIGGER feature_flag_catalog_cohort_guard BEFORE UPDATE ON control.feature_flag_catalog
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_feature_cohort();

CREATE TRIGGER parameter_definition_revision BEFORE INSERT OR UPDATE ON control.parameter_definition
FOR EACH ROW EXECUTE FUNCTION control.trg_advance_parameter_version();
CREATE TRIGGER tenant_parameter_value_version BEFORE INSERT OR UPDATE ON control.tenant_parameter_value
FOR EACH ROW EXECUTE FUNCTION control.trg_advance_parameter_version();
