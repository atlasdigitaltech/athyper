CREATE INDEX subscription_plan_active_pidx
    ON control.subscription_plan (sort_order, code)
    WHERE status = 'active';

CREATE UNIQUE INDEX owner_type_platform_code_uq
    ON control.owner_type (code)
    WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX owner_type_tenant_code_uq
    ON control.owner_type (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX owner_type_active_capability_idx
    ON control.owner_type
       (tenant_id, supports_address, supports_contact, sort_order, code)
    WHERE status = 'active';

CREATE INDEX owner_type_target_idx
    ON control.owner_type (target_schema, target_table)
    WHERE status <> 'deprecated';

CREATE INDEX owner_type_purpose_lookup_idx
    ON control.owner_type_purpose (capability, purpose_code, owner_type_id);

CREATE INDEX network_document_type_entity_idx
    ON control.network_document_type (entity_id, status);

CREATE INDEX network_document_type_active_direction_idx
    ON control.network_document_type (direction_scope, code)
    WHERE status = 'active';

CREATE INDEX delivery_policy_resolve_idx ON control.delivery_policy (tenant_id, network_account_id, delivery_type, destination_type, code) WHERE is_enabled;

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
