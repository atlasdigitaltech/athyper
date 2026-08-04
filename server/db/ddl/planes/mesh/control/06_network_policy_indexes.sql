CREATE INDEX routing_rule_resolution_idx
    ON control.routing_rule (tenant_id, network_account_id, event_type, priority)
    WHERE status = 'active';
CREATE INDEX routing_rule_document_idx
    ON control.routing_rule (document_type_code) WHERE document_type_code IS NOT NULL;
CREATE UNIQUE INDEX retention_policy_active_uq
    ON control.retention_policy (tenant_id, network_account_id, resource_type)
    WHERE status = 'active';
CREATE INDEX retention_policy_expiry_idx
    ON control.retention_policy (tenant_id, network_account_id, effective_until)
    WHERE status IN ('active','scheduled');
CREATE INDEX quota_policy_resolution_idx
    ON control.quota_policy (tenant_id, network_account_id, usage_metric_code, quota_subject)
    WHERE status = 'active';
