-- ============================================================================
-- mesh_control/08_rls.sql
-- Mesh control row-level security.
-- ============================================================================
-- Runtime controls are readable by the owning Mesh account when account-scoped.
-- Platform-global rows have account_code NULL. Mutations are reserved for Mesh
-- admin/control-plane workers.

ALTER TABLE mesh_control.feature_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.reference_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.delivery_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.quota_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.connector_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.connector_instance ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.notification_provider ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.notification_routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.notification_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.cron_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.policy_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.policy_rule_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.change_request ENABLE ROW LEVEL SECURITY;

ALTER TABLE mesh_control.feature_flag FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.reference_sync_state FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.routing_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.delivery_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.retention_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.quota_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.connector_type FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.connector_instance FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.notification_provider FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.notification_routing_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.notification_template FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.cron_schedule FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.policy_rule FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.policy_rule_version FORCE ROW LEVEL SECURITY;
ALTER TABLE mesh_control.change_request FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mesh_control_feature_flag_read ON mesh_control.feature_flag;
CREATE POLICY mesh_control_feature_flag_read ON mesh_control.feature_flag
    FOR SELECT USING (true);
DROP POLICY IF EXISTS mesh_control_feature_flag_admin ON mesh_control.feature_flag;
CREATE POLICY mesh_control_feature_flag_admin ON mesh_control.feature_flag
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_reference_sync_state_read ON mesh_control.reference_sync_state;
CREATE POLICY mesh_control_reference_sync_state_read ON mesh_control.reference_sync_state
    FOR SELECT USING (true);
DROP POLICY IF EXISTS mesh_control_reference_sync_state_admin ON mesh_control.reference_sync_state;
CREATE POLICY mesh_control_reference_sync_state_admin ON mesh_control.reference_sync_state
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_routing_rule_read ON mesh_control.routing_rule;
CREATE POLICY mesh_control_routing_rule_read ON mesh_control.routing_rule
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
        OR sender_account_code = mesh.current_account_code()
        OR receiver_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_routing_rule_admin ON mesh_control.routing_rule;
CREATE POLICY mesh_control_routing_rule_admin ON mesh_control.routing_rule
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_delivery_policy_read ON mesh_control.delivery_policy;
CREATE POLICY mesh_control_delivery_policy_read ON mesh_control.delivery_policy
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_delivery_policy_admin ON mesh_control.delivery_policy;
CREATE POLICY mesh_control_delivery_policy_admin ON mesh_control.delivery_policy
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_retention_policy_read ON mesh_control.retention_policy;
CREATE POLICY mesh_control_retention_policy_read ON mesh_control.retention_policy
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_retention_policy_admin ON mesh_control.retention_policy;
CREATE POLICY mesh_control_retention_policy_admin ON mesh_control.retention_policy
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_quota_policy_read ON mesh_control.quota_policy;
CREATE POLICY mesh_control_quota_policy_read ON mesh_control.quota_policy
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_quota_policy_admin ON mesh_control.quota_policy;
CREATE POLICY mesh_control_quota_policy_admin ON mesh_control.quota_policy
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_connector_type_read ON mesh_control.connector_type;
CREATE POLICY mesh_control_connector_type_read ON mesh_control.connector_type
    FOR SELECT USING (true);
DROP POLICY IF EXISTS mesh_control_connector_type_admin ON mesh_control.connector_type;
CREATE POLICY mesh_control_connector_type_admin ON mesh_control.connector_type
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_connector_instance_read ON mesh_control.connector_instance;
CREATE POLICY mesh_control_connector_instance_read ON mesh_control.connector_instance
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_control_connector_instance_admin ON mesh_control.connector_instance;
CREATE POLICY mesh_control_connector_instance_admin ON mesh_control.connector_instance
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_notification_provider_read ON mesh_control.notification_provider;
CREATE POLICY mesh_control_notification_provider_read ON mesh_control.notification_provider
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_notification_provider_admin ON mesh_control.notification_provider;
CREATE POLICY mesh_control_notification_provider_admin ON mesh_control.notification_provider
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_notification_routing_rule_read ON mesh_control.notification_routing_rule;
CREATE POLICY mesh_control_notification_routing_rule_read ON mesh_control.notification_routing_rule
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_notification_routing_rule_admin ON mesh_control.notification_routing_rule;
CREATE POLICY mesh_control_notification_routing_rule_admin ON mesh_control.notification_routing_rule
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_notification_template_read ON mesh_control.notification_template;
CREATE POLICY mesh_control_notification_template_read ON mesh_control.notification_template
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_notification_template_admin ON mesh_control.notification_template;
CREATE POLICY mesh_control_notification_template_admin ON mesh_control.notification_template
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_cron_schedule_read ON mesh_control.cron_schedule;
CREATE POLICY mesh_control_cron_schedule_read ON mesh_control.cron_schedule
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_cron_schedule_admin ON mesh_control.cron_schedule;
CREATE POLICY mesh_control_cron_schedule_admin ON mesh_control.cron_schedule
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_policy_rule_read ON mesh_control.policy_rule;
CREATE POLICY mesh_control_policy_rule_read ON mesh_control.policy_rule
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_policy_rule_admin ON mesh_control.policy_rule;
CREATE POLICY mesh_control_policy_rule_admin ON mesh_control.policy_rule
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_policy_rule_version_read ON mesh_control.policy_rule_version;
CREATE POLICY mesh_control_policy_rule_version_read ON mesh_control.policy_rule_version
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_policy_rule_version_admin ON mesh_control.policy_rule_version;
CREATE POLICY mesh_control_policy_rule_version_admin ON mesh_control.policy_rule_version
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

DROP POLICY IF EXISTS mesh_control_change_request_read ON mesh_control.change_request;
CREATE POLICY mesh_control_change_request_read ON mesh_control.change_request
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR account_code IS NULL
        OR account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_control_change_request_admin ON mesh_control.change_request;
CREATE POLICY mesh_control_change_request_admin ON mesh_control.change_request
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());
