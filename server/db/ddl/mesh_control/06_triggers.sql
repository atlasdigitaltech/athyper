-- ============================================================================
-- mesh_control/06_triggers.sql
-- Audit timestamp and versioning triggers for Mesh controls.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_feature_flag_updated_at ON mesh_control.feature_flag;
CREATE TRIGGER trg_feature_flag_updated_at
    BEFORE UPDATE ON mesh_control.feature_flag
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_reference_sync_state_updated_at ON mesh_control.reference_sync_state;
CREATE TRIGGER trg_reference_sync_state_updated_at
    BEFORE UPDATE ON mesh_control.reference_sync_state
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_routing_rule_updated_at ON mesh_control.routing_rule;
CREATE TRIGGER trg_routing_rule_updated_at
    BEFORE UPDATE ON mesh_control.routing_rule
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_policy_updated_at ON mesh_control.delivery_policy;
CREATE TRIGGER trg_delivery_policy_updated_at
    BEFORE UPDATE ON mesh_control.delivery_policy
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_retention_policy_updated_at ON mesh_control.retention_policy;
CREATE TRIGGER trg_retention_policy_updated_at
    BEFORE UPDATE ON mesh_control.retention_policy
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_quota_policy_updated_at ON mesh_control.quota_policy;
CREATE TRIGGER trg_quota_policy_updated_at
    BEFORE UPDATE ON mesh_control.quota_policy
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_connector_type_updated_at ON mesh_control.connector_type;
CREATE TRIGGER trg_connector_type_updated_at
    BEFORE UPDATE ON mesh_control.connector_type
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_connector_instance_updated_at ON mesh_control.connector_instance;
CREATE TRIGGER trg_connector_instance_updated_at
    BEFORE UPDATE ON mesh_control.connector_instance
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_provider_updated_at ON mesh_control.notification_provider;
CREATE TRIGGER trg_notification_provider_updated_at
    BEFORE UPDATE ON mesh_control.notification_provider
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_routing_rule_updated_at ON mesh_control.notification_routing_rule;
CREATE TRIGGER trg_notification_routing_rule_updated_at
    BEFORE UPDATE ON mesh_control.notification_routing_rule
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_template_updated_at ON mesh_control.notification_template;
CREATE TRIGGER trg_notification_template_updated_at
    BEFORE UPDATE ON mesh_control.notification_template
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_cron_schedule_updated_at ON mesh_control.cron_schedule;
CREATE TRIGGER trg_cron_schedule_updated_at
    BEFORE UPDATE ON mesh_control.cron_schedule
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_policy_rule_updated_at ON mesh_control.policy_rule;
CREATE TRIGGER trg_policy_rule_updated_at
    BEFORE UPDATE ON mesh_control.policy_rule
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_policy_rule_version_snapshot ON mesh_control.policy_rule;
CREATE TRIGGER trg_policy_rule_version_snapshot
    BEFORE UPDATE ON mesh_control.policy_rule
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_policy_rule_version_snapshot();

DROP TRIGGER IF EXISTS trg_policy_rule_version_immutable ON mesh_control.policy_rule_version;
CREATE TRIGGER trg_policy_rule_version_immutable
    BEFORE UPDATE OR DELETE ON mesh_control.policy_rule_version
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_prevent_mutation();

DROP TRIGGER IF EXISTS trg_change_request_updated_at ON mesh_control.change_request;
CREATE TRIGGER trg_change_request_updated_at
    BEFORE UPDATE ON mesh_control.change_request
    FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();
