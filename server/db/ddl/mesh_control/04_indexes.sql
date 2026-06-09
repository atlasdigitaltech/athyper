-- ============================================================================
-- mesh_control/04_indexes.sql
-- Query paths for Mesh control configuration.
-- ============================================================================

CREATE INDEX IF NOT EXISTS mesh_control_feature_flag_enabled_idx
    ON mesh_control.feature_flag (is_enabled, expires_at)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS mesh_control_reference_sync_state_status_idx
    ON mesh_control.reference_sync_state (status, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS mesh_control_routing_rule_match_idx
    ON mesh_control.routing_rule (
        account_code, route_type, event_type, document_type_code, priority
    )
    WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS mesh_control_routing_rule_accounts_idx
    ON mesh_control.routing_rule (sender_account_code, receiver_account_code)
    WHERE sender_account_code IS NOT NULL OR receiver_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_control_delivery_policy_type_idx
    ON mesh_control.delivery_policy (account_code, delivery_type, destination_type)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS mesh_control_retention_policy_resource_idx
    ON mesh_control.retention_policy (account_code, resource_type)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS mesh_control_quota_policy_metric_idx
    ON mesh_control.quota_policy (account_code, quota_subject, quota_metric)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS mesh_control_connector_type_category_idx
    ON mesh_control.connector_type (category, status);

CREATE INDEX IF NOT EXISTS mesh_control_connector_instance_account_idx
    ON mesh_control.connector_instance (account_code, connector_type_code, status);
CREATE INDEX IF NOT EXISTS mesh_control_connector_instance_health_idx
    ON mesh_control.connector_instance (health, last_health_check_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS mesh_control_notification_provider_channel_idx
    ON mesh_control.notification_provider (account_code, channel, priority)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS mesh_control_notification_route_event_idx
    ON mesh_control.notification_routing_rule (account_code, event_type, sort_order)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS mesh_control_notification_template_active_idx
    ON mesh_control.notification_template (account_code, template_key, channel, locale_code)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS mesh_control_cron_schedule_active_idx
    ON mesh_control.cron_schedule (is_enabled, effective_from, effective_until)
    WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS mesh_control_cron_schedule_next_run_idx
    ON mesh_control.cron_schedule (next_run_at)
    WHERE is_enabled = true AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_control_policy_rule_match_idx
    ON mesh_control.policy_rule (account_code, rule_type, resource_type, action_code, priority)
    WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS mesh_control_policy_rule_version_rule_idx
    ON mesh_control.policy_rule_version (policy_rule_id, version_no DESC);

CREATE INDEX IF NOT EXISTS mesh_control_change_request_status_idx
    ON mesh_control.change_request (account_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS mesh_control_change_request_target_idx
    ON mesh_control.change_request (target_table, target_id)
    WHERE target_id IS NOT NULL;
