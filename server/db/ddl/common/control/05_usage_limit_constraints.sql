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
