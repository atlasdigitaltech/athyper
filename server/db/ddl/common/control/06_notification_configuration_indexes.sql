CREATE INDEX notification_provider_active_idx ON control.notification_provider (channel, priority) WHERE is_enabled;
CREATE INDEX notification_provider_health_idx ON control.notification_provider (health) WHERE health IN ('degraded','down');
CREATE INDEX notification_template_resolve_idx ON control.notification_template (tenant_id, template_key, channel, locale, version DESC) WHERE status = 'active';
CREATE INDEX notification_routing_rule_resolve_idx ON control.notification_routing_rule (tenant_id, event_type, sort_order) WHERE is_enabled;
CREATE INDEX notification_routing_rule_entity_idx ON control.notification_routing_rule (event_type, entity_type) WHERE entity_type IS NOT NULL AND is_enabled;
