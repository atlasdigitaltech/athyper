CREATE INDEX lookup_domain_active_idx
  ON control.lookup_domain(code) WHERE status = 'active';
CREATE UNIQUE INDEX lookup_value_global_uq
  ON control.lookup_value(domain_code, code) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX lookup_value_tenant_uq
  ON control.lookup_value(tenant_id, domain_code, code) WHERE tenant_id IS NOT NULL;
CREATE INDEX lookup_value_tenant_domain_idx
  ON control.lookup_value(tenant_id, domain_code) WHERE tenant_id IS NOT NULL;
CREATE INDEX lookup_value_validation_idx
  ON control.lookup_value(domain_code, code) WHERE status = 'active';

CREATE INDEX connector_instance_type_idx
    ON control.connector_instance (connector_type_id);
CREATE INDEX connector_instance_tenant_status_idx
    ON control.connector_instance (tenant_id, status);
CREATE INDEX integration_endpoint_instance_idx
    ON control.integration_endpoint (tenant_id, connector_instance_id);
CREATE INDEX webhook_subscription_endpoint_idx
    ON control.webhook_subscription (tenant_id, integration_endpoint_id);
CREATE INDEX webhook_subscription_topics_gin
    ON control.webhook_subscription USING gin (topics);

CREATE INDEX cycle_type_tenant_status_idx
    ON control.cycle_type (tenant_id, status);
CREATE INDEX cycle_phase_type_idx
    ON control.cycle_phase (tenant_id, cycle_type_id, sort_order);
CREATE INDEX cycle_task_category_type_idx
    ON control.cycle_task_category (tenant_id, cycle_type_id, sort_order);
CREATE INDEX cycle_task_template_phase_idx
    ON control.cycle_task_template (tenant_id, cycle_type_id, phase_id, sort_order);
CREATE INDEX cycle_task_template_category_idx
    ON control.cycle_task_template (tenant_id, cycle_type_id, category_id);
CREATE INDEX cycle_task_template_default_owner_idx
    ON control.cycle_task_template (tenant_id, default_owner_principal_id)
    WHERE default_owner_principal_id IS NOT NULL;
CREATE INDEX cycle_task_dependency_successor_idx
    ON control.cycle_task_dependency (tenant_id, cycle_type_id, successor_template_id);
CREATE INDEX cycle_cross_dependency_successor_idx
    ON control.cycle_cross_dependency
       (tenant_id, successor_type_id, successor_phase_id);
CREATE INDEX cycle_carryforward_rule_type_idx
    ON control.cycle_carryforward_rule (tenant_id, cycle_type_id);
CREATE INDEX cycle_template_revision_latest_idx
    ON control.cycle_template_revision (tenant_id, cycle_type_id, revision_number DESC);

CREATE UNIQUE INDEX bank_account_validation_rule_applicability_uq
    ON control.bank_account_validation_rule (
        country_code, payment_rail_code, direction, COALESCE(currency_code, '***')
    )
    WHERE status = 'active';

CREATE INDEX bank_account_validation_rule_resolve_idx
    ON control.bank_account_validation_rule (
        country_code, payment_rail_code, direction, priority DESC
    )
    WHERE status = 'active';

CREATE INDEX subscription_plan_usage_limit_active_idx
    ON control.subscription_plan_usage_limit
        (subscription_plan_id, usage_metric_id, dimension_code)
    WHERE status = 'active';

CREATE INDEX tenant_usage_limit_override_resolve_idx
    ON control.tenant_usage_limit_override
        (tenant_id, usage_metric_id, dimension_code, effective_from DESC)
    WHERE status = 'active';

CREATE INDEX feature_flag_catalog_active_idx
    ON control.feature_flag_catalog (code)
    WHERE status = 'active';

CREATE INDEX feature_flag_catalog_module_idx
    ON control.feature_flag_catalog (module_id, code)
    WHERE status = 'active' AND module_id IS NOT NULL;

CREATE INDEX parameter_definition_module_idx
    ON control.parameter_definition (module_id, code)
    WHERE status = 'active' AND module_id IS NOT NULL;

CREATE INDEX usage_metric_catalog_module_idx
    ON control.usage_metric_catalog (module_id, code)
    WHERE status = 'active' AND module_id IS NOT NULL;

CREATE INDEX feature_flag_override_resolve_idx
    ON control.feature_flag_override (tenant_id, feature_flag_id, effective_from DESC)
    WHERE status = 'active';

CREATE INDEX parameter_definition_active_idx
    ON control.parameter_definition (sort_order, code)
    WHERE status = 'active';

CREATE INDEX tenant_parameter_value_resolve_idx
    ON control.tenant_parameter_value (tenant_id, parameter_definition_id, effective_from DESC)
    WHERE status = 'active';

CREATE INDEX cron_schedule_due_idx ON control.cron_schedule (is_enabled, effective_from, effective_until, code) WHERE is_enabled;
CREATE INDEX cron_schedule_tenant_idx ON control.cron_schedule (tenant_id, code) WHERE tenant_id IS NOT NULL;
CREATE INDEX cron_schedule_change_log_schedule_idx ON control.cron_schedule_change_log (tenant_id, schedule_id, changed_at DESC);

CREATE INDEX notification_provider_active_idx ON control.notification_provider (channel, priority) WHERE is_enabled;
CREATE INDEX notification_provider_health_idx ON control.notification_provider (health) WHERE health IN ('degraded','down');
CREATE INDEX notification_template_resolve_idx ON control.notification_template (tenant_id, template_key, channel, locale, version DESC) WHERE status = 'active';
CREATE INDEX notification_routing_rule_resolve_idx ON control.notification_routing_rule (tenant_id, event_type, sort_order) WHERE is_enabled;
CREATE INDEX notification_routing_rule_entity_idx ON control.notification_routing_rule (event_type, entity_type) WHERE entity_type IS NOT NULL AND is_enabled;

CREATE UNIQUE INDEX numbering_policy_global_active_code_uq
    ON control.numbering_policy (policy_code)
    WHERE tenant_id IS NULL AND status = 'active';
CREATE UNIQUE INDEX numbering_policy_tenant_active_code_uq
    ON control.numbering_policy (tenant_id, policy_code)
    WHERE tenant_id IS NOT NULL AND status = 'active';
CREATE INDEX numbering_policy_resolve_ix
    ON control.numbering_policy (tenant_id, policy_code, policy_revision)
    WHERE status = 'active';

CREATE INDEX pdef_effective_idx
    ON control.policy_definition (
        tenant_id,
        entity_type,
        effective_from,
        effective_until
    );

CREATE INDEX pdef_global_entity_active_pidx
    ON control.policy_definition (entity_type, priority)
    WHERE tenant_id IS NULL AND is_active = true;

CREATE INDEX pdef_module_idx
    ON control.policy_definition (module_id)
    WHERE module_id IS NOT NULL;

CREATE INDEX pdef_tenant_entity_active_idx
    ON control.policy_definition (tenant_id, entity_type, priority)
    WHERE is_active = true;

CREATE INDEX policy_rule_definition_idx
    ON control.policy_rule (policy_definition_id, priority);
CREATE INDEX policy_rule_created_by_idx
    ON control.policy_rule (created_by);
CREATE INDEX policy_test_case_definition_idx
    ON control.policy_test_case (policy_definition_id, status, code);
CREATE INDEX policy_test_case_created_by_idx
    ON control.policy_test_case (created_by);
CREATE UNIQUE INDEX policy_definition_revision_uq
    ON control.policy_definition (tenant_id, entity_type, name, version_no) NULLS NOT DISTINCT;
CREATE INDEX policy_test_result_hash_idx ON control.policy_test_result (policy_definition_id, definition_hash, executed_at DESC);
CREATE UNIQUE INDEX policy_activation_coordinate_uq ON control.policy_activation (tenant_id, entity_type, name) NULLS NOT DISTINCT;
CREATE INDEX policy_evaluation_history_lookup_idx ON control.policy_evaluation_history (tenant_id, entity_type, evaluated_at DESC);
CREATE UNIQUE INDEX workspace_module_one_primary_uq
    ON control.workspace_module (module_id)
    WHERE is_primary AND status = 'active';

CREATE INDEX workspace_module_navigation_idx
    ON control.workspace_module (workspace_id, sort_order, module_id)
    WHERE status = 'active';

CREATE INDEX subscription_plan_module_plan_idx
    ON control.subscription_plan_module (subscription_plan_id, entitlement_mode, module_id)
    WHERE status = 'active';

CREATE INDEX subscription_plan_module_module_idx
    ON control.subscription_plan_module (module_id, subscription_plan_id)
    WHERE status = 'active';

CREATE INDEX rounding_rule_status_idx
    ON control.rounding_rule (tenant_id, status, code);

CREATE INDEX rounding_rule_created_by_idx
    ON control.rounding_rule (tenant_id, created_by);

CREATE INDEX rounding_context_lookup_idx
    ON control.rounding_context (tenant_id, company_code_id, currency_code, slot);

CREATE INDEX rounding_context_rule_idx
    ON control.rounding_context (tenant_id, rounding_rule_id);
