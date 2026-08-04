-- ============================================================================
-- mesh_control/06_triggers.sql
-- Non-internal triggers reconstructed from the live catalog.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.auth_catalog_owner FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."auth_catalog_owner" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.auth_permission FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."auth_permission" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_permission_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.auth_permission FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_permission();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.auth_permission_category FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('global');

ALTER TABLE "mesh_control"."auth_permission_category" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.auth_permission_plane FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."auth_permission_plane" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_permission_plane_guard BEFORE INSERT OR UPDATE ON mesh_control.auth_permission_plane FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_permission_plane();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.auth_permission_scope_policy FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."auth_permission_scope_policy" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_scope_policy_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.auth_permission_scope_policy FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_scope_policy();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.auth_plane FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('global');

ALTER TABLE "mesh_control"."auth_plane" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_authorization_v5_consumer_guard BEFORE DELETE OR UPDATE ON mesh_control.authorization_consumer_migration_v2 FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v5_consumer_guard();

CREATE TRIGGER trg_authorization_cohort_guard_v2 BEFORE INSERT OR DELETE OR UPDATE ON mesh_control.authorization_cutover_cohort_v2 FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_cohort_guard_v2();

CREATE TRIGGER trg_authorization_cutover_state_guard_v2 BEFORE DELETE OR UPDATE ON mesh_control.authorization_cutover_plane_v2 FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_cutover_state_guard_v2();

CREATE TRIGGER trg_mesh_authorization_v5_release_guard BEFORE INSERT OR UPDATE ON mesh_control.authorization_runtime_release_v2 FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v5_release_guard();

CREATE TRIGGER trg_authorization_v3_scope_mapping_guard BEFORE INSERT OR UPDATE ON mesh_control.authorization_v3_scope_mapping FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v3_scope_mapping_guard();

CREATE TRIGGER trg_authorization_v3_subject_mapping_guard BEFORE INSERT OR UPDATE ON mesh_control.authorization_v3_subject_mapping FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v3_subject_mapping_guard();

CREATE TRIGGER trg_authorization_writer_switch_receipt_immutable_v2 BEFORE DELETE OR UPDATE ON mesh_control.authorization_writer_switch_receipt_v2 FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_wave7_immutable_v2();

CREATE TRIGGER trg_change_request_updated_at BEFORE UPDATE ON mesh_control.change_request FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_connector_instance_updated_at BEFORE UPDATE ON mesh_control.connector_instance FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_connector_type_updated_at BEFORE UPDATE ON mesh_control.connector_type FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_cron_schedule_updated_at BEFORE UPDATE ON mesh_control.cron_schedule FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_delivery_policy_updated_at BEFORE UPDATE ON mesh_control.delivery_policy FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.entity FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."entity" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_entity_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.entity FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_entity();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.entity_operation FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."entity_operation" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_operation_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.entity_operation FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_operation();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.entity_operation_plane FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."entity_operation_plane" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_operation_plane_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.entity_operation_plane FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_operation_plane();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.entity_scope_binding FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."entity_scope_binding" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_scope_binding_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.entity_scope_binding FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_scope_binding();

CREATE TRIGGER trg_authorization_v2_invalidate AFTER INSERT OR DELETE OR UPDATE ON mesh_control.entity_version FOR EACH ROW EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2('auto');

ALTER TABLE "mesh_control"."entity_version" ENABLE ALWAYS TRIGGER "trg_authorization_v2_invalidate";

CREATE TRIGGER trg_mesh_auth_entity_version_publish_guard BEFORE INSERT OR UPDATE ON mesh_control.entity_version FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_authorization_v2_guard_entity_version();

CREATE TRIGGER trg_feature_flag_updated_at BEFORE UPDATE ON mesh_control.feature_flag FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_notification_provider_updated_at BEFORE UPDATE ON mesh_control.notification_provider FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_notification_routing_rule_updated_at BEFORE UPDATE ON mesh_control.notification_routing_rule FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_notification_template_updated_at BEFORE UPDATE ON mesh_control.notification_template FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_policy_rule_updated_at BEFORE UPDATE ON mesh_control.policy_rule FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_policy_rule_version_snapshot BEFORE UPDATE ON mesh_control.policy_rule FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_policy_rule_version_snapshot();

CREATE TRIGGER trg_policy_rule_version_immutable BEFORE DELETE OR UPDATE ON mesh_control.policy_rule_version FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_prevent_mutation();

CREATE TRIGGER trg_preserved_identity_receipt_immutable_v2 BEFORE DELETE OR UPDATE ON mesh_control.preserved_identity_migration_receipt_v2 FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_preserved_identity_receipt_immutable_v2();

CREATE TRIGGER trg_quota_policy_updated_at BEFORE UPDATE ON mesh_control.quota_policy FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_reference_sync_state_updated_at BEFORE UPDATE ON mesh_control.reference_sync_state FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_retention_policy_updated_at BEFORE UPDATE ON mesh_control.retention_policy FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();

CREATE TRIGGER trg_routing_rule_updated_at BEFORE UPDATE ON mesh_control.routing_rule FOR EACH ROW EXECUTE FUNCTION mesh_control.trg_set_updated_at();
