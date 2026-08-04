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
