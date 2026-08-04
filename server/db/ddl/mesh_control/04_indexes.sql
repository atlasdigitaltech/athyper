-- ============================================================================
-- mesh_control/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

CREATE UNIQUE INDEX mesh_auth_owner_account_uidx ON mesh_control.auth_catalog_owner USING btree (account_id) WHERE owner_kind = 'account'::text;

CREATE INDEX mesh_auth_owner_active_idx ON mesh_control.auth_catalog_owner USING btree (owner_kind, account_scope_key, id) WHERE status = 'active'::text;

CREATE UNIQUE INDEX mesh_auth_owner_single_platform_uidx ON mesh_control.auth_catalog_owner USING btree (owner_kind) WHERE owner_kind = 'platform'::text;

CREATE UNIQUE INDEX mesh_auth_permission_code_published_uidx ON mesh_control.auth_permission USING btree (catalog_owner_id, account_scope_key, canonical_code) WHERE status = 'published'::text;

CREATE INDEX mesh_auth_permission_effective_idx ON mesh_control.auth_permission USING btree (effective_from, effective_until) WHERE status = 'published'::text;

CREATE UNIQUE INDEX mesh_auth_permission_exact_published_uidx ON mesh_control.auth_permission USING btree (catalog_owner_id, account_scope_key, entity_id, operation_code) WHERE status = 'published'::text AND entity_id IS NOT NULL;

CREATE INDEX mesh_auth_permission_product_idx ON mesh_control.auth_permission USING btree (product_code, capability_code) WHERE status = 'published'::text;

CREATE INDEX mesh_auth_permission_plane_active_idx ON mesh_control.auth_permission_plane USING btree (plane_code, permission_id) WHERE status = 'active'::text;

CREATE INDEX mesh_auth_scope_policy_published_idx ON mesh_control.auth_permission_scope_policy USING btree (permission_id, plane_code, scope_kind) WHERE status = 'published'::text;

CREATE INDEX mesh_authorization_anomaly_disposition_resolution_idx ON mesh_control.authorization_anomaly_disposition USING btree (classification, resolved_at);

CREATE INDEX mesh_authorization_anomaly_disposition_source_idx ON mesh_control.authorization_anomaly_disposition USING btree (source_schema, source_table, finding_kind, severity);

CREATE INDEX mesh_authorization_capture_source_enabled_idx ON mesh_control.authorization_capture_source USING btree (capture_enabled, source_kind, source_schema, source_table);

CREATE INDEX mesh_authorization_migration_run_source_idx ON mesh_control.authorization_migration_run USING btree (source_database_id, snapshot_watermark, cutover_watermark);

CREATE INDEX mesh_authorization_migration_run_status_idx ON mesh_control.authorization_migration_run USING btree (status, created_at DESC);

CREATE INDEX mesh_authorization_v2_conservation_run_idx ON mesh_control.authorization_v2_conservation_ledger USING btree (migration_run_id, phase, status, created_at);

CREATE INDEX mesh_authorization_v2_deferred_constraint_status_idx ON mesh_control.authorization_v2_deferred_constraint_registry USING btree (validation_status, validation_deadline);

CREATE INDEX mesh_authorization_v2_frozen_legacy_status_idx ON mesh_control.authorization_v2_frozen_legacy_object USING btree (status, source_schema, source_table);

CREATE INDEX mesh_authorization_v2_transformer_effective_idx ON mesh_control.authorization_v2_transformer_registry USING btree (transformer_version, capture_contract_version, status, effective_from, effective_until);

CREATE INDEX mesh_authorization_v3_scope_mapping_status_idx ON mesh_control.authorization_v3_scope_mapping USING btree (source_watermark_id, status, account_id);

CREATE INDEX mesh_authorization_v3_subject_mapping_status_idx ON mesh_control.authorization_v3_subject_mapping USING btree (source_watermark_id, status, account_id);

CREATE INDEX mesh_authorization_writer_registry_match_idx ON mesh_control.authorization_writer_registry USING btree (status, priority, effective_from, effective_until) WHERE status = 'approved'::text;

CREATE INDEX mesh_control_change_request_status_idx ON mesh_control.change_request USING btree (account_code, status, created_at DESC);

CREATE INDEX mesh_control_change_request_target_idx ON mesh_control.change_request USING btree (target_table, target_id) WHERE target_id IS NOT NULL;

CREATE INDEX mesh_control_connector_instance_account_idx ON mesh_control.connector_instance USING btree (account_code, connector_type_code, status);

CREATE INDEX mesh_control_connector_instance_health_idx ON mesh_control.connector_instance USING btree (health, last_health_check_at) WHERE status = 'active'::text;

CREATE INDEX mesh_control_connector_type_category_idx ON mesh_control.connector_type USING btree (category, status);

CREATE INDEX mesh_control_cron_schedule_active_idx ON mesh_control.cron_schedule USING btree (is_enabled, effective_from, effective_until) WHERE is_enabled = true;

CREATE INDEX mesh_control_cron_schedule_next_run_idx ON mesh_control.cron_schedule USING btree (next_run_at) WHERE is_enabled = true AND next_run_at IS NOT NULL;

CREATE INDEX mesh_control_delivery_policy_type_idx ON mesh_control.delivery_policy USING btree (account_code, delivery_type, destination_type) WHERE is_enabled = true;

CREATE UNIQUE INDEX mesh_auth_entity_published_uidx ON mesh_control.entity USING btree (catalog_owner_id, account_scope_key, entity_code) WHERE status = 'published'::text;

CREATE INDEX mesh_auth_entity_relation_idx ON mesh_control.entity USING btree (relation_schema, relation_name) WHERE status = 'published'::text AND relation_schema IS NOT NULL;

CREATE INDEX mesh_auth_operation_permission_idx ON mesh_control.entity_operation USING btree (permission_id, entity_id, entity_version_id) WHERE status = 'published'::text;

CREATE UNIQUE INDEX mesh_auth_operation_published_uidx ON mesh_control.entity_operation USING btree (catalog_owner_id, account_scope_key, entity_id, operation_code) WHERE status = 'published'::text;

CREATE INDEX mesh_auth_operation_plane_published_idx ON mesh_control.entity_operation_plane USING btree (plane_code, entity_operation_id, permission_id) WHERE status = 'published'::text;

CREATE INDEX mesh_auth_scope_binding_policy_idx ON mesh_control.entity_scope_binding USING btree (scope_policy_id, scope_kind);

CREATE INDEX mesh_auth_scope_binding_published_idx ON mesh_control.entity_scope_binding USING btree (account_scope_key, entity_id, entity_operation_id, permission_id) WHERE status = 'published'::text;

CREATE INDEX mesh_auth_entity_version_active_idx ON mesh_control.entity_version USING btree (entity_id, effective_from, effective_until) WHERE status = 'published'::text;

CREATE INDEX mesh_control_feature_flag_enabled_idx ON mesh_control.feature_flag USING btree (is_enabled, expires_at) WHERE is_enabled = true;

CREATE INDEX mesh_control_notification_provider_channel_idx ON mesh_control.notification_provider USING btree (account_code, channel, priority) WHERE is_enabled = true;

CREATE INDEX mesh_control_notification_route_event_idx ON mesh_control.notification_routing_rule USING btree (account_code, event_type, sort_order) WHERE is_enabled = true;

CREATE INDEX mesh_control_notification_template_active_idx ON mesh_control.notification_template USING btree (account_code, template_key, channel, locale_code) WHERE status = 'active'::text;

CREATE INDEX mesh_control_policy_rule_match_idx ON mesh_control.policy_rule USING btree (account_code, rule_type, resource_type, action_code, priority) WHERE is_enabled = true;

CREATE INDEX mesh_control_policy_rule_version_rule_idx ON mesh_control.policy_rule_version USING btree (policy_rule_id, version_no DESC);

CREATE INDEX mesh_control_quota_policy_metric_idx ON mesh_control.quota_policy USING btree (account_code, quota_subject, quota_metric) WHERE is_enabled = true;

CREATE INDEX mesh_control_reference_sync_state_status_idx ON mesh_control.reference_sync_state USING btree (status, last_synced_at DESC);

CREATE INDEX mesh_control_retention_policy_resource_idx ON mesh_control.retention_policy USING btree (account_code, resource_type) WHERE is_enabled = true;

CREATE INDEX mesh_control_routing_rule_accounts_idx ON mesh_control.routing_rule USING btree (sender_account_code, receiver_account_code) WHERE sender_account_code IS NOT NULL OR receiver_account_code IS NOT NULL;

CREATE INDEX mesh_control_routing_rule_match_idx ON mesh_control.routing_rule USING btree (account_code, route_type, event_type, document_type_code, priority) WHERE is_enabled = true;
