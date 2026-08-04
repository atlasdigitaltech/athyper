CREATE INDEX delivery_policy_resolve_idx ON control.delivery_policy (tenant_id, network_account_id, delivery_type, destination_type, code) WHERE is_enabled;
