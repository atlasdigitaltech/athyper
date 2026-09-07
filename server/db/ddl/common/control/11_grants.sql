REVOKE ALL ON
    control.workspace,
    control.module,
    control.workspace_module,
    control.subscription_plan_module
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON
            control.workspace,
            control.module,
            control.workspace_module,
            control.subscription_plan_module
        TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyper_projection_applier') THEN
        GRANT SELECT, INSERT, UPDATE ON
            control.workspace,
            control.module,
            control.workspace_module,
            control.subscription_plan_module
        TO athyper_projection_applier;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.workspace,
            control.module,
            control.workspace_module,
            control.subscription_plan_module
        TO athyperadmin;
    END IF;
END;
$$;

GRANT SELECT ON control.lookup_domain TO athyperapp;
GRANT SELECT, INSERT, UPDATE, DELETE ON control.lookup_value TO athyperapp;
GRANT ALL PRIVILEGES ON control.lookup_domain, control.lookup_value TO athyperadmin;
GRANT EXECUTE ON FUNCTION control.lookup_value_is_active(text, text, uuid)
  TO athyperapp, athyperadmin;

REVOKE ALL ON
    control.connector_type,
    control.connector_instance,
    control.integration_endpoint,
    control.webhook_subscription,
    control.cycle_type,
    control.cycle_phase,
    control.cycle_task_category,
    control.cycle_task_template,
    control.cycle_task_dependency,
    control.cycle_cross_dependency,
    control.cycle_carryforward_rule,
    control.cycle_template_revision
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON control.connector_type TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            control.connector_instance,
            control.integration_endpoint,
            control.webhook_subscription,
            control.cycle_type,
            control.cycle_phase,
            control.cycle_task_category,
            control.cycle_task_template,
            control.cycle_task_dependency,
            control.cycle_cross_dependency,
            control.cycle_carryforward_rule
        TO athyperapp;
        GRANT SELECT, INSERT ON control.cycle_template_revision TO athyperapp;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.connector_type,
            control.connector_instance,
            control.integration_endpoint,
            control.webhook_subscription,
            control.cycle_type,
            control.cycle_phase,
            control.cycle_task_category,
            control.cycle_task_template,
            control.cycle_task_dependency,
            control.cycle_cross_dependency,
            control.cycle_carryforward_rule,
            control.cycle_template_revision
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.bank_account_validation_rule FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON control.bank_account_validation_rule TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.resolve_bank_account_validation_rule(char, text, control.bank_validation_direction_d, char)
            TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.bank_account_validation_rule TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.resolve_bank_account_validation_rule(char, text, control.bank_validation_direction_d, char)
            TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.usage_metric_catalog,
    control.subscription_plan_usage_limit,
    control.tenant_usage_limit_override
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON
            control.usage_metric_catalog,
            control.subscription_plan_usage_limit,
            control.tenant_usage_limit_override
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.usage_metric_catalog,
            control.subscription_plan_usage_limit,
            control.tenant_usage_limit_override
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON
    control.feature_flag_catalog,
    control.feature_flag_override,
    control.parameter_definition,
    control.tenant_parameter_value
FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT ON
            control.feature_flag_catalog,
            control.feature_flag_override,
            control.parameter_definition
        TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON control.tenant_parameter_value TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.feature_flag_catalog,
            control.feature_flag_override,
            control.parameter_definition,
            control.tenant_parameter_value
        TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.cron_schedule FROM PUBLIC;
REVOKE ALL ON control.cron_schedule_change_log FROM PUBLIC;
REVOKE ALL ON FUNCTION control.fn_cron_schedules_for_scheduler() FROM PUBLIC;
REVOKE ALL ON FUNCTION control.fn_mark_cron_schedule_reconciled(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA control TO athyper_jobs_service;
GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyper_jobs_service;
GRANT EXECUTE ON FUNCTION control.fn_mark_cron_schedule_reconciled(uuid,timestamptz,timestamptz) TO athyper_jobs_service;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON control.cron_schedule TO athyperapp;
        GRANT SELECT, INSERT ON control.cron_schedule_change_log TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_mark_cron_schedule_reconciled(uuid,timestamptz,timestamptz) TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.cron_schedule TO athyperadmin;
        GRANT ALL PRIVILEGES ON control.cron_schedule_change_log TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.fn_mark_cron_schedule_reconciled(uuid,timestamptz,timestamptz) TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.notification_provider, control.notification_template, control.notification_routing_rule FROM PUBLIC;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT, INSERT, UPDATE ON control.notification_provider, control.notification_template, control.notification_routing_rule TO athyperapp; END IF; IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON control.notification_provider, control.notification_template, control.notification_routing_rule TO athyperadmin; END IF; END $$;

REVOKE ALL ON control.numbering_policy FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON control.numbering_policy TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.numbering_policy TO athyperadmin;
    END IF;
END $$;

REVOKE ALL ON control.rounding_rule, control.rounding_context FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            control.rounding_rule,
            control.rounding_context
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            control.rounding_rule,
            control.rounding_context
        TO athyperadmin;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA control TO athyperapp, athyperadmin;

GRANT SELECT ON TABLE control.policy_definition TO athyperapp;
GRANT ALL PRIVILEGES ON TABLE control.policy_definition TO athyperadmin;

REVOKE ALL ON control.policy_rule, control.policy_test_case FROM PUBLIC;
GRANT SELECT ON control.policy_rule, control.policy_test_case TO athyperapp;
GRANT ALL PRIVILEGES ON control.policy_rule, control.policy_test_case TO athyperadmin;

REVOKE ALL ON control.policy_activation, control.policy_evaluation_history FROM PUBLIC;
GRANT SELECT ON control.policy_activation, control.policy_evaluation_history TO athyperapp;
GRANT ALL PRIVILEGES ON control.policy_activation, control.policy_evaluation_history TO athyperadmin;

REVOKE ALL ON control.ui_locale_catalog, master.tenant_locale_activation FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON control.ui_locale_catalog TO athyperapp;
        GRANT SELECT, INSERT, UPDATE, DELETE ON master.tenant_locale_activation TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.ui_locale_catalog, master.tenant_locale_activation TO athyperadmin;
    END IF;
END;
$$;

REVOKE ALL ON control.tenant_module_entitlement_override FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON control.tenant_module_entitlement_override, control.tenant_usage_limit_override TO athyperapp;
GRANT ALL ON control.tenant_module_entitlement_override TO athyperadmin;

GRANT SELECT,INSERT,UPDATE ON control.feature_flag_override TO athyperapp;

REVOKE ALL ON FUNCTION control.lock_parameter_definition(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.lock_parameter_definition(uuid) TO athyperapp,athyperadmin;

REVOKE ALL ON FUNCTION control.parameter_value_matches_definition(jsonb,text,jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION control.parameter_json_is_api_compatible(jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.parameter_value_matches_definition(jsonb,text,jsonb,jsonb,jsonb) TO athyperapp,athyperadmin;
GRANT EXECUTE ON FUNCTION control.parameter_json_is_api_compatible(jsonb,integer) TO athyperapp,athyperadmin;
