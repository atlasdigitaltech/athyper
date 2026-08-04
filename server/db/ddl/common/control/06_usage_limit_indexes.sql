CREATE INDEX subscription_plan_usage_limit_active_idx
    ON control.subscription_plan_usage_limit
        (subscription_plan_id, usage_metric_id, dimension_code)
    WHERE status = 'active';

CREATE INDEX tenant_usage_limit_override_resolve_idx
    ON control.tenant_usage_limit_override
        (tenant_id, usage_metric_id, dimension_code, effective_from DESC)
    WHERE status = 'active';
