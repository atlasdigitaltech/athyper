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
