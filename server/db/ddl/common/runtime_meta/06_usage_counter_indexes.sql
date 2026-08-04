CREATE INDEX tenant_usage_counter_metric_idx
    ON runtime_meta.tenant_usage_counter (usage_metric_id, tenant_id);
