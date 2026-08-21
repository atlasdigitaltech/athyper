ALTER TABLE control.lookup_domain
  ADD CONSTRAINT lookup_domain_pkey PRIMARY KEY (id),
  ADD CONSTRAINT lookup_domain_code_uq UNIQUE (code),
  ADD CONSTRAINT lookup_domain_code_fmt_chk
    CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  ADD CONSTRAINT lookup_domain_name_nonempty_chk CHECK (btrim(name) <> ''),
  ADD CONSTRAINT lookup_domain_source_schema_fmt_chk
    CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'),
  ADD CONSTRAINT lookup_domain_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT lookup_domain_status_chk CHECK (status IN ('active', 'deprecated')),
  ADD CONSTRAINT lookup_domain_status_audit_pair_chk
    CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  ADD CONSTRAINT lookup_domain_audit_pair_chk
    CHECK ((updated_at IS NULL) = (updated_by IS NULL));

ALTER TABLE control.lookup_value
  ADD CONSTRAINT lookup_value_pkey PRIMARY KEY (id),
  ADD CONSTRAINT lookup_value_code_fmt_chk
    CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  ADD CONSTRAINT lookup_value_name_nonempty_chk CHECK (btrim(name) <> ''),
  ADD CONSTRAINT lookup_value_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT lookup_value_status_chk CHECK (status IN ('active', 'deprecated')),
  ADD CONSTRAINT lookup_value_status_audit_pair_chk
    CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
  ADD CONSTRAINT lookup_value_audit_pair_chk
    CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
  ADD CONSTRAINT lookup_value_system_consistency_chk CHECK (
    (is_system AND tenant_id IS NULL)
    OR (NOT is_system AND tenant_id IS NOT NULL)
  ),
  ADD CONSTRAINT lookup_value_domain_fk
    FOREIGN KEY (domain_code) REFERENCES control.lookup_domain(code) ON DELETE RESTRICT,
  ADD CONSTRAINT lookup_value_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE control.connector_instance
    ADD CONSTRAINT connector_instance_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT connector_instance_type_fk
        FOREIGN KEY (connector_type_id) REFERENCES control.connector_type(id),
    ADD CONSTRAINT connector_instance_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT connector_instance_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT connector_instance_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.integration_endpoint
    ADD CONSTRAINT integration_endpoint_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT integration_endpoint_instance_fk
        FOREIGN KEY (tenant_id, connector_instance_id)
        REFERENCES control.connector_instance(tenant_id, id),
    ADD CONSTRAINT integration_endpoint_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT integration_endpoint_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT integration_endpoint_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.webhook_subscription
    ADD CONSTRAINT webhook_subscription_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT webhook_subscription_endpoint_fk
        FOREIGN KEY (tenant_id, integration_endpoint_id)
        REFERENCES control.integration_endpoint(tenant_id, id),
    ADD CONSTRAINT webhook_subscription_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT webhook_subscription_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT webhook_subscription_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_type
    ADD CONSTRAINT cycle_type_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_type_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_type_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_type_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_phase
    ADD CONSTRAINT cycle_phase_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_phase_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_phase_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_phase_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_phase_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_task_category
    ADD CONSTRAINT cycle_task_category_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_category_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_task_category_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_category_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_category_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_task_template
    ADD CONSTRAINT cycle_task_template_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_template_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_phase_fk
        FOREIGN KEY (tenant_id, cycle_type_id, phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_template_category_fk
        FOREIGN KEY (tenant_id, cycle_type_id, category_id)
        REFERENCES control.cycle_task_category(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_template_default_owner_fk
        FOREIGN KEY (tenant_id, default_owner_principal_id)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_template_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_task_dependency
    ADD CONSTRAINT cycle_task_dependency_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_task_dependency_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_task_dependency_predecessor_fk
        FOREIGN KEY (tenant_id, cycle_type_id, predecessor_template_id)
        REFERENCES control.cycle_task_template(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_dependency_successor_fk
        FOREIGN KEY (tenant_id, cycle_type_id, successor_template_id)
        REFERENCES control.cycle_task_template(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_task_dependency_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_task_dependency_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_cross_dependency
    ADD CONSTRAINT cycle_cross_dependency_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_cross_dependency_predecessor_type_fk
        FOREIGN KEY (tenant_id, predecessor_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_cross_dependency_predecessor_phase_fk
        FOREIGN KEY (tenant_id, predecessor_type_id, predecessor_phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_cross_dependency_successor_type_fk
        FOREIGN KEY (tenant_id, successor_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_cross_dependency_successor_phase_fk
        FOREIGN KEY (tenant_id, successor_type_id, successor_phase_id)
        REFERENCES control.cycle_phase(tenant_id, cycle_type_id, id),
    ADD CONSTRAINT cycle_cross_dependency_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_cross_dependency_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_carryforward_rule
    ADD CONSTRAINT cycle_carryforward_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_carryforward_rule_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_carryforward_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_carryforward_rule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cycle_template_revision
    ADD CONSTRAINT cycle_template_revision_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cycle_template_revision_type_fk
        FOREIGN KEY (tenant_id, cycle_type_id) REFERENCES control.cycle_type(tenant_id, id),
    ADD CONSTRAINT cycle_template_revision_published_by_fk
        FOREIGN KEY (tenant_id, published_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cycle_template_revision_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.bank_account_validation_rule
    ADD CONSTRAINT bank_account_validation_rule_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country(code),
    ADD CONSTRAINT bank_account_validation_rule_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code);

ALTER TABLE control.subscription_plan_usage_limit
    ADD CONSTRAINT subscription_plan_usage_limit_plan_fk
    FOREIGN KEY (subscription_plan_id)
    REFERENCES control.subscription_plan (id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT subscription_plan_usage_limit_metric_fk
    FOREIGN KEY (usage_metric_id)
    REFERENCES control.usage_metric_catalog (id)
    ON DELETE RESTRICT;

ALTER TABLE control.tenant_usage_limit_override
    ADD CONSTRAINT tenant_usage_limit_override_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT tenant_usage_limit_override_metric_fk
    FOREIGN KEY (usage_metric_id)
    REFERENCES control.usage_metric_catalog (id)
    ON DELETE RESTRICT;

ALTER TABLE control.tenant_usage_limit_override
    ADD CONSTRAINT tenant_usage_limit_override_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        usage_metric_id WITH =,
        dimension_code WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.feature_flag_override
    ADD CONSTRAINT feature_flag_override_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT feature_flag_override_feature_flag_fk
    FOREIGN KEY (feature_flag_id)
    REFERENCES control.feature_flag_catalog (id)
    ON DELETE RESTRICT;

ALTER TABLE control.feature_flag_override
    ADD CONSTRAINT feature_flag_override_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        feature_flag_id WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.tenant_parameter_value
    ADD CONSTRAINT tenant_parameter_value_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE CASCADE,
    ADD CONSTRAINT tenant_parameter_value_definition_fk
    FOREIGN KEY (parameter_definition_id)
    REFERENCES control.parameter_definition (id)
    ON DELETE RESTRICT;

ALTER TABLE control.tenant_parameter_value
    ADD CONSTRAINT tenant_parameter_value_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        parameter_definition_id WITH =,
        tstzrange(effective_from, effective_until, '[)') WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.cron_schedule
    ADD CONSTRAINT cron_schedule_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT cron_schedule_timezone_fk FOREIGN KEY (timezone) REFERENCES shared.timezone(code) ON DELETE RESTRICT;

ALTER TABLE control.notification_template ADD CONSTRAINT notification_template_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE control.notification_routing_rule ADD CONSTRAINT notification_routing_rule_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE control.numbering_policy
    ADD CONSTRAINT numbering_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_timezone_fk
        FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE RESTRICT,
    ADD CONSTRAINT numbering_policy_activated_by_fk
        FOREIGN KEY (activated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;

ALTER TABLE control.policy_definition
    ADD CONSTRAINT pdef_effective_order_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    ADD CONSTRAINT pdef_entity_type_nonempty
        CHECK (btrim(entity_type) <> ''),
    ADD CONSTRAINT pdef_eval_mode_chk
        CHECK (evaluation_mode IN ('first_match', 'accumulate', 'all')),
    ADD CONSTRAINT pdef_name_nonempty
        CHECK (btrim(name) <> ''),
    ADD CONSTRAINT pdef_priority_pos
        CHECK (priority > 0),
    ADD CONSTRAINT pdef_status_chk
        CHECK (status IN ('draft', 'pending_approval', 'published', 'active', 'retired', 'inactive', 'deprecated')),
    ADD CONSTRAINT pdef_hash_chk
        CHECK (definition_hash IS NULL OR definition_hash ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT pdef_published_hash_chk
        CHECK (status NOT IN ('published', 'active') OR definition_hash IS NOT NULL),
    ADD CONSTRAINT pdef_version_pos
        CHECK (version_no > 0),
    ADD CONSTRAINT pdef_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    ADD CONSTRAINT pdef_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT pdef_module_fk
        FOREIGN KEY (module_id) REFERENCES control.module(id) ON DELETE SET NULL,
    ADD CONSTRAINT pdef_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
    ADD CONSTRAINT pdef_predecessor_fk
        FOREIGN KEY (predecessor_id) REFERENCES control.policy_definition(id) ON DELETE RESTRICT;

ALTER TABLE control.policy_rule
    ADD CONSTRAINT policy_rule_definition_fk
        FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE CASCADE,
    ADD CONSTRAINT policy_rule_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_rule_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.policy_test_case
    ADD CONSTRAINT policy_test_case_definition_fk
        FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE CASCADE,
    ADD CONSTRAINT policy_test_case_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_test_case_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_test_case_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.policy_test_result
    ADD CONSTRAINT policy_test_result_case_fk FOREIGN KEY (policy_test_case_id) REFERENCES control.policy_test_case(id) ON DELETE CASCADE,
    ADD CONSTRAINT policy_test_result_definition_fk FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_test_result_executed_by_fk FOREIGN KEY (executed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE control.policy_activation
    ADD CONSTRAINT policy_activation_definition_fk FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_activation_activated_by_fk FOREIGN KEY (activated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
ALTER TABLE control.policy_evaluation_history
    ADD CONSTRAINT policy_evaluation_history_definition_fk FOREIGN KEY (policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE RESTRICT,
    ADD CONSTRAINT policy_evaluation_history_evaluated_by_fk FOREIGN KEY (evaluated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.usage_metric_catalog
    ADD CONSTRAINT usage_metric_catalog_module_fk
        FOREIGN KEY (module_id) REFERENCES control.module(id) ON DELETE SET NULL;

ALTER TABLE control.feature_flag_catalog
    ADD CONSTRAINT feature_flag_catalog_module_fk
        FOREIGN KEY (module_id) REFERENCES control.module(id) ON DELETE SET NULL;

ALTER TABLE control.parameter_definition
    ADD CONSTRAINT parameter_definition_module_fk
        FOREIGN KEY (module_id) REFERENCES control.module(id) ON DELETE SET NULL;
ALTER TABLE control.workspace
    ADD CONSTRAINT control_workspace_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT control_workspace_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT control_workspace_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.module
    ADD CONSTRAINT control_module_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT control_module_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT control_module_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.workspace_module
    ADD CONSTRAINT workspace_module_workspace_fk
        FOREIGN KEY (workspace_id) REFERENCES control.workspace(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workspace_module_module_fk
        FOREIGN KEY (module_id) REFERENCES control.module(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workspace_module_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workspace_module_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workspace_module_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.subscription_plan_module
    ADD CONSTRAINT subscription_plan_module_plan_fk
        FOREIGN KEY (subscription_plan_id) REFERENCES control.subscription_plan(id) ON DELETE RESTRICT,
    ADD CONSTRAINT subscription_plan_module_module_fk
        FOREIGN KEY (module_id) REFERENCES control.module(id) ON DELETE RESTRICT,
    ADD CONSTRAINT subscription_plan_module_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT subscription_plan_module_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT,
    ADD CONSTRAINT subscription_plan_module_status_changed_by_fk
        FOREIGN KEY (status_changed_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE control.rounding_rule
    ADD CONSTRAINT rounding_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT rounding_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
            REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT rounding_rule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
            REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT rounding_rule_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
            REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.rounding_context
    ADD CONSTRAINT rounding_context_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT rounding_context_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT rounding_context_rule_fk
        FOREIGN KEY (tenant_id, rounding_rule_id)
            REFERENCES control.rounding_rule(tenant_id, id),
    ADD CONSTRAINT rounding_context_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
            REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT rounding_context_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
            REFERENCES master.principal(tenant_id, id);
