-- ============================================================================
-- mesh_control/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "mesh_control"."auth_catalog_owner" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_catalog_owner" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_entitlement_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_entitlement_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission_category" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission_category" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission_plane" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission_plane" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission_scope_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_permission_scope_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_plane" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."auth_plane" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_anomaly_disposition" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_anomaly_disposition" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_capture_source" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_capture_source" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_consumer_migration_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_consumer_migration_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_cutover_cohort_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_cutover_cohort_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_cutover_plane_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_cutover_plane_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_migration_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_migration_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_runtime_release_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_runtime_release_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_target_guard_installation_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_target_guard_installation_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_conservation_ledger" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_conservation_ledger" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_expand_installation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_expand_installation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_frozen_legacy_object" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_frozen_legacy_object" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_transformer_registry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v2_transformer_registry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v3_scope_mapping" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v3_scope_mapping" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v3_subject_mapping" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v3_subject_mapping" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_writer_registry" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_writer_registry" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_writer_switch_receipt_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."authorization_writer_switch_receipt_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."change_request" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."change_request" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."connector_instance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."connector_instance" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."connector_type" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."connector_type" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."cron_schedule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."cron_schedule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."delivery_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."delivery_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_operation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_operation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_operation_plane" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_operation_plane" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_scope_binding" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_scope_binding" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."entity_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."feature_flag" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."feature_flag" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."notification_provider" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."notification_provider" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."notification_routing_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."notification_routing_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."notification_template" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."notification_template" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."policy_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."policy_rule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."policy_rule_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."policy_rule_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."preserved_identity_migration_receipt_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."preserved_identity_migration_receipt_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."quota_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."quota_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."reference_sync_state" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."reference_sync_state" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."retention_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."retention_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."routing_rule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mesh_control"."routing_rule" FORCE ROW LEVEL SECURITY;

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."auth_catalog_owner"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."auth_permission"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."auth_permission_category"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."auth_permission_plane"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."auth_permission_scope_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."auth_plane"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_anomaly_disposition_admin" ON "mesh_control"."authorization_anomaly_disposition"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_capture_source_admin" ON "mesh_control"."authorization_capture_source"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_capture_source_internal_read" ON "mesh_control"."authorization_capture_source"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (current_setting('app.mesh_authorization_capture_internal'::text, true) = 'on'::text AND pg_has_role(CURRENT_USER, 'athyperadmin'::name, 'member'::text));

CREATE POLICY "mesh_authorization_v5_admin" ON "mesh_control"."authorization_consumer_migration_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v7_admin" ON "mesh_control"."authorization_cutover_cohort_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v7_admin" ON "mesh_control"."authorization_cutover_plane_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_migration_run_admin" ON "mesh_control"."authorization_migration_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_migration_run_internal_read" ON "mesh_control"."authorization_migration_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (current_setting('app.mesh_authorization_capture_internal'::text, true) = 'on'::text AND pg_has_role(CURRENT_USER, 'athyperadmin'::name, 'member'::text));

CREATE POLICY "mesh_authorization_v5_admin" ON "mesh_control"."authorization_runtime_release_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v7_admin" ON "mesh_control"."authorization_shadow_mismatch_disposition_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v7_admin" ON "mesh_control"."authorization_target_guard_installation_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."authorization_v2_conservation_ledger"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."authorization_v2_deferred_constraint_registry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."authorization_v2_expand_installation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."authorization_v2_frozen_legacy_object"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."authorization_v2_transformer_registry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_writer_registry_admin" ON "mesh_control"."authorization_writer_registry"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authorization_v7_admin" ON "mesh_control"."authorization_writer_switch_receipt_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_control_change_request_admin" ON "mesh_control"."change_request"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_change_request_read" ON "mesh_control"."change_request"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_connector_instance_admin" ON "mesh_control"."connector_instance"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_connector_instance_read" ON "mesh_control"."connector_instance"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_connector_type_admin" ON "mesh_control"."connector_type"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_connector_type_read" ON "mesh_control"."connector_type"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "mesh_control_cron_schedule_admin" ON "mesh_control"."cron_schedule"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_cron_schedule_read" ON "mesh_control"."cron_schedule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_delivery_policy_admin" ON "mesh_control"."delivery_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_delivery_policy_read" ON "mesh_control"."delivery_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."entity"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."entity_operation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."entity_operation_plane"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."entity_scope_binding"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_authorization_v2_admin" ON "mesh_control"."entity_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_control_feature_flag_admin" ON "mesh_control"."feature_flag"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_feature_flag_read" ON "mesh_control"."feature_flag"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "mesh_control_notification_provider_admin" ON "mesh_control"."notification_provider"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_notification_provider_read" ON "mesh_control"."notification_provider"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_notification_routing_rule_admin" ON "mesh_control"."notification_routing_rule"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_notification_routing_rule_read" ON "mesh_control"."notification_routing_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_notification_template_admin" ON "mesh_control"."notification_template"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_notification_template_read" ON "mesh_control"."notification_template"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_policy_rule_admin" ON "mesh_control"."policy_rule"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_policy_rule_read" ON "mesh_control"."policy_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_policy_rule_version_admin" ON "mesh_control"."policy_rule_version"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_policy_rule_version_read" ON "mesh_control"."policy_rule_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_preserved_identity_migration_receipt_v2_admin" ON "mesh_control"."preserved_identity_migration_receipt_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "mesh_control_quota_policy_admin" ON "mesh_control"."quota_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_quota_policy_read" ON "mesh_control"."quota_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_reference_sync_state_admin" ON "mesh_control"."reference_sync_state"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_reference_sync_state_read" ON "mesh_control"."reference_sync_state"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "mesh_control_retention_policy_admin" ON "mesh_control"."retention_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_retention_policy_read" ON "mesh_control"."retention_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code());

CREATE POLICY "mesh_control_routing_rule_admin" ON "mesh_control"."routing_rule"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (mesh.is_mesh_admin())
  WITH CHECK (mesh.is_mesh_admin());

CREATE POLICY "mesh_control_routing_rule_read" ON "mesh_control"."routing_rule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (mesh.is_mesh_admin() OR account_code IS NULL OR account_code = mesh.current_account_code() OR sender_account_code = mesh.current_account_code() OR receiver_account_code = mesh.current_account_code());

GRANT EXECUTE ON FUNCTION "mesh_control".authorization_v2_is_effective(p_effective_from timestamp with time zone, p_effective_until timestamp with time zone, p_at timestamp with time zone) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".authorization_v2_owner_aligned(p_catalog_owner_id uuid, p_account_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".authorization_v2_window_contains(p_parent_from timestamp with time zone, p_parent_until timestamp with time zone, p_child_from timestamp with time zone, p_child_until timestamp with time zone) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_freeze_legacy_writes_v2(p_expected_source_database_id uuid, p_expected_revision text, p_approval_ticket text, p_approved_by text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_install_legacy_freeze_guards_v2() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_install_target_guard_v2(p_target_relation regclass, p_approval_ticket text, p_approved_by text, p_definition_sha256 text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_set_cohort_state_v2(p_cohort_code text, p_requested_state text, p_expected_source_database_id uuid, p_transition_ticket text, p_transition_by text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_set_resolver_state_v2(p_requested_state text, p_expected_revision text, p_new_revision text, p_approval_ticket text, p_approved_by text, p_rollback_owner text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_switch_writer_v2(p_expected_source_database_id uuid, p_expected_source_watermark bigint, p_expected_revision text, p_legacy_writer_key text, p_target_writer_key text, p_instant_rollback_promised boolean, p_reverse_projector_status text, p_reverse_projector_evidence_sha256 text, p_gate_evidence_sha256 text, p_approval_ticket text, p_approved_by text, p_rollback_owner text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".fn_authorization_validate_target_guard_v2(p_target_relation regclass, p_expected_definition_sha256 text, p_validation_ticket text, p_validated_by text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_entity() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_entity_version() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_operation() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_operation_plane() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_permission() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_permission_plane() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_scope_binding() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v2_guard_scope_policy() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v3_scope_mapping_guard() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "mesh_control".trg_authorization_v3_subject_mapping_guard() TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_catalog_owner" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_entitlement_policy" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_permission" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_permission_category" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_permission_plane" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_permission_scope_policy" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."auth_plane" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_anomaly_disposition" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_capture_source" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_consumer_migration_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_cutover_cohort_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_cutover_plane_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_migration_run" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_runtime_release_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_shadow_mismatch_disposition_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_target_guard_installation_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v2_conservation_ledger" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v2_deferred_constraint_registry" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v2_expand_installation" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v2_frozen_legacy_object" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v2_transformer_registry" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v3_scope_mapping" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v3_subject_mapping" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_v4_legacy_exception_disposition" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_writer_registry" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."authorization_writer_switch_receipt_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."entity" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."entity_operation" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."entity_operation_plane" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."entity_scope_binding" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."entity_version" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."preserved_identity_migration_receipt_v2" TO athyperadmin;

GRANT DELETE ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT INSERT ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT REFERENCES ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT SELECT ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT TRIGGER ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT TRUNCATE ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;

GRANT UPDATE ON TABLE "mesh_control"."v_authorization_v2_operation_publication" TO athyperadmin;
