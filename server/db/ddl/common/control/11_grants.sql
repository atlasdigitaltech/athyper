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
    control.cycle_carryforward_rule
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
            control.cycle_carryforward_rule
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
REVOKE ALL ON FUNCTION control.fn_cron_schedules_for_scheduler() FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON control.cron_schedule TO athyperapp;
        GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON control.cron_schedule TO athyperadmin;
        GRANT EXECUTE ON FUNCTION control.fn_cron_schedules_for_scheduler() TO athyperadmin;
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
