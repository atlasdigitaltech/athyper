-- ============================================================================
-- log/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "log"."activity_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."activity_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_agent_call" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_agent_call" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_agent_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_agent_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_calibration_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_calibration_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_call_transcript" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_call_transcript" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_feedback_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_feedback_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_inference_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_inference_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_monitoring_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."ai_monitoring_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."atlas_byok_audit" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."atlas_byok_audit" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."attachment_access_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."attachment_access_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."audit_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."auth_decision_evidence_v2" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."auth_decision_evidence_v2" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."auth_decision_evidence_v2_default" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."auth_decision_evidence_v2_default" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."close_activity_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."close_activity_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."close_override_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."close_override_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."comment_retention_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."comment_retention_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."cycle_audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."cycle_audit_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."dimension_resolution_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."dimension_resolution_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."entity_lifecycle_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."entity_lifecycle_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."export_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."export_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."field_access_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."field_access_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."hash_anchor" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."hash_anchor" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."job_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."job_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."kpi_execution_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."kpi_execution_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."notification_delivery_attempt" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."notification_delivery_attempt" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."password_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."password_history" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."permission_decision_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."permission_decision_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."policy_evaluation_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."policy_evaluation_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."render_dlq" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."render_dlq" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."resolution_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."resolution_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."search_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."search_history" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."security_event_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."security_event_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."share_audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."share_audit_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."workflow_event_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."workflow_event_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "log"."workspace_usage_metric" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "log"."workspace_usage_metric" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "log"."activity_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."activity_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."activity_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."activity_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."activity_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."activity_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."activity_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."activity_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."ai_agent_call"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_agent_call"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_agent_call"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_agent_call"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_agent_call"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_agent_call"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."ai_agent_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_agent_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_agent_run"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_agent_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_agent_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_agent_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."ai_calibration_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_calibration_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_calibration_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_calibration_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_calibration_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_calibration_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."ai_call_transcript"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_call_transcript"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_call_transcript"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_call_transcript"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_call_transcript"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_call_transcript"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."ai_call_transcript_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_call_transcript_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."ai_feedback_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_feedback_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_feedback_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_feedback_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_feedback_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_feedback_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."ai_inference_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_inference_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_inference_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_inference_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_inference_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_inference_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."ai_monitoring_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."ai_monitoring_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."ai_monitoring_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."ai_monitoring_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."ai_monitoring_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."ai_monitoring_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "atlas_byok_audit_insert" ON "log"."atlas_byok_audit"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_deny_delete" ON "log"."atlas_byok_audit"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."atlas_byok_audit"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."attachment_access_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."attachment_access_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."attachment_access_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."attachment_access_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."attachment_access_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."attachment_access_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."attachment_access_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."attachment_access_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_delete" ON "log"."audit_dlq"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."audit_dlq"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."audit_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."audit_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."audit_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."audit_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."audit_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."audit_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "auth_decision_evidence_v2_admin" ON "log"."auth_decision_evidence_v2"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_decision_evidence_v2_tenant_read" ON "log"."auth_decision_evidence_v2"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."auth_decision_evidence_v2"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."auth_decision_evidence_v2"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "auth_decision_evidence_v2_admin" ON "log"."auth_decision_evidence_v2_default"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "auth_decision_evidence_v2_tenant_read" ON "log"."auth_decision_evidence_v2_default"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."auth_decision_evidence_v2_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."auth_decision_evidence_v2_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."close_activity_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."close_activity_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."close_activity_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."close_activity_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."close_activity_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."close_activity_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."close_override_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."close_override_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."close_override_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."close_override_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."close_override_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."close_override_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."comment_retention_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."comment_retention_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."comment_retention_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."comment_retention_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."comment_retention_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."comment_retention_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."cycle_audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."cycle_audit_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."cycle_audit_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."cycle_audit_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."cycle_audit_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."cycle_audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."cycle_audit_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."cycle_audit_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_delete" ON "log"."descriptor_cache_invalidation"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."descriptor_cache_invalidation"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_delete" ON "log"."descriptor_cache_invalidation_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."descriptor_cache_invalidation_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."dimension_resolution_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."dimension_resolution_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."dimension_resolution_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."dimension_resolution_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."dimension_resolution_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."dimension_resolution_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."entity_lifecycle_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."entity_lifecycle_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."entity_lifecycle_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."entity_lifecycle_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."entity_lifecycle_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."entity_lifecycle_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."export_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."export_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."export_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."export_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."export_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."export_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."field_access_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."field_access_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."field_access_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."field_access_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."field_access_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."field_access_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."field_access_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."field_access_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."hash_anchor"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."hash_anchor"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."hash_anchor"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."hash_anchor"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."hash_anchor"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."hash_anchor"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."job_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."job_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."job_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."job_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."job_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."job_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."kpi_execution_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."kpi_execution_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."kpi_execution_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."kpi_execution_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."kpi_execution_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."kpi_execution_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "log"."notification_delivery_attempt"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_deny_delete" ON "log"."notification_dlq"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."notification_dlq"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_delete" ON "log"."parameter_change_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."parameter_change_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."password_history"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."password_history"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."password_history"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."password_history"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."password_history"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "log"."permission_decision_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."permission_decision_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."permission_decision_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."permission_decision_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."permission_decision_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."permission_decision_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."permission_decision_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."permission_decision_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_delete" ON "log"."platform_audit_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."platform_audit_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."policy_evaluation_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."policy_evaluation_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."policy_evaluation_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."policy_evaluation_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."policy_evaluation_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."policy_evaluation_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."render_dlq"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."render_dlq"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."render_dlq"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."render_dlq"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."render_dlq"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."render_dlq"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."resolution_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."resolution_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."resolution_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."resolution_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."resolution_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."resolution_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."search_history"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."search_history"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."search_history"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."search_history"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."search_history"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."search_history"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."search_history_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."search_history_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."security_event_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."security_event_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."security_event_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."security_event_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."security_event_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."security_event_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."security_event_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."security_event_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."share_audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."share_audit_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."share_audit_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."share_audit_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."share_audit_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."share_audit_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "log"."workflow_event_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."workflow_event_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."workflow_event_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."workflow_event_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."workflow_event_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."workflow_event_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "log"."workflow_event_log_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."workflow_event_log_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "log"."workspace_usage_metric"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "log"."workspace_usage_metric"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "log"."workspace_usage_metric"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "log"."workspace_usage_metric"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "log"."workspace_usage_metric"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "log"."workspace_usage_metric"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

GRANT EXECUTE ON FUNCTION "log".create_cycle_audit_partition(p_target date) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "log".emit_cycle_audit(p_tenant_id uuid, p_entity_code character varying, p_cycle_type_code character varying, p_domain character varying, p_event_type character varying, p_cycle_run_id uuid, p_target_id uuid, p_target_type character varying, p_actor_id uuid, p_actor_type character varying, p_from_status character varying, p_to_status character varying, p_payload jsonb, p_reason text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "log".emit_cycle_audit(p_tenant_id uuid, p_entity_code character varying, p_cycle_type_code character varying, p_domain character varying, p_event_type character varying, p_cycle_run_id uuid, p_target_id uuid, p_target_type character varying, p_actor_id uuid, p_actor_type character varying, p_from_status character varying, p_to_status character varying, p_payload jsonb, p_reason text) TO athyperapp;

GRANT EXECUTE ON FUNCTION "log".trg_auth_decision_evidence_v2_immutable() TO athyperadmin;

GRANT DELETE ON TABLE "log"."activity_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."activity_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."activity_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."activity_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."activity_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."activity_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."activity_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."activity_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."activity_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."activity_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_agent_call" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_agent_call" TO athyperapp;

GRANT SELECT ON TABLE "log"."ai_agent_call" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_agent_run" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_agent_run" TO athyperapp;

GRANT SELECT ON TABLE "log"."ai_agent_run" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_calibration_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_calibration_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_call_transcript" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_call_transcript" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_call_transcript_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_call_transcript_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_feedback_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_feedback_log" TO athyperapp;

GRANT SELECT ON TABLE "log"."ai_feedback_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_inference_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_inference_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."ai_monitoring_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."ai_monitoring_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT INSERT ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT SELECT ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."atlas_byok_audit" TO athyperadmin;

GRANT INSERT ON TABLE "log"."atlas_byok_audit" TO athyperapp;

GRANT SELECT ON TABLE "log"."atlas_byok_audit" TO athyperapp;

GRANT DELETE ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."attachment_access_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."attachment_access_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."attachment_access_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."attachment_access_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT INSERT ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT SELECT ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."audit_dlq" TO athyperadmin;

GRANT SELECT ON TABLE "log"."audit_dlq" TO athyperapp;

GRANT DELETE ON TABLE "log"."audit_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."audit_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."audit_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."audit_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."audit_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."audit_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."audit_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."audit_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT INSERT ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT SELECT ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."auth_decision_evidence_v2" TO athyperadmin;

GRANT SELECT ON TABLE "log"."auth_decision_evidence_v2" TO athyperapp;

GRANT DELETE ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."auth_decision_evidence_v2_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."close_activity_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."close_activity_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."close_override_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."close_override_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."comment_retention_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."comment_retention_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."cycle_audit_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."cycle_audit_log" TO athyperapp;

GRANT SELECT ON TABLE "log"."cycle_audit_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."cycle_audit_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."cycle_audit_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT INSERT ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT SELECT ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."descriptor_cache_invalidation" TO athyperadmin;

GRANT SELECT ON TABLE "log"."descriptor_cache_invalidation" TO athyperapp;

GRANT DELETE ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."descriptor_cache_invalidation_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."dimension_resolution_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."dimension_resolution_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."entity_lifecycle_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."entity_lifecycle_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."export_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."export_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."export_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."export_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."export_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."export_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."export_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."export_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."field_access_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."field_access_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."field_access_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."field_access_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT INSERT ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT SELECT ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."hash_anchor" TO athyperadmin;

GRANT SELECT ON TABLE "log"."hash_anchor" TO athyperapp;

GRANT DELETE ON TABLE "log"."job_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."job_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."job_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."job_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."job_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."job_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."job_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."job_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."kpi_execution_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."kpi_execution_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT INSERT ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT SELECT ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."notification_delivery_attempt" TO athyperadmin;

GRANT SELECT ON TABLE "log"."notification_delivery_attempt" TO athyperapp;

GRANT DELETE ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT INSERT ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT SELECT ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."notification_dlq" TO athyperadmin;

GRANT SELECT ON TABLE "log"."notification_dlq" TO athyperapp;

GRANT DELETE ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."parameter_change_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."parameter_change_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."password_history" TO athyperadmin;

GRANT INSERT ON TABLE "log"."password_history" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."password_history" TO athyperadmin;

GRANT SELECT ON TABLE "log"."password_history" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."password_history" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."password_history" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."password_history" TO athyperadmin;

GRANT SELECT ON TABLE "log"."password_history" TO athyperapp;

GRANT DELETE ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."permission_decision_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."permission_decision_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."permission_decision_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."permission_decision_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."platform_audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."platform_audit_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."policy_evaluation_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."policy_evaluation_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT INSERT ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT SELECT ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."render_dlq" TO athyperadmin;

GRANT SELECT ON TABLE "log"."render_dlq" TO athyperapp;

GRANT DELETE ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."resolution_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."resolution_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."search_history" TO athyperadmin;

GRANT INSERT ON TABLE "log"."search_history" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."search_history" TO athyperadmin;

GRANT SELECT ON TABLE "log"."search_history" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."search_history" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."search_history" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."search_history" TO athyperadmin;

GRANT SELECT ON TABLE "log"."search_history" TO athyperapp;

GRANT DELETE ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."search_history_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."search_history_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."security_event_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."security_event_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."security_event_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."security_event_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."share_audit_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."share_audit_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT INSERT ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT SELECT ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."v_resolution_pipeline" TO athyperadmin;

GRANT SELECT ON TABLE "log"."v_resolution_pipeline" TO athyperapp;

GRANT DELETE ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT INSERT ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."workflow_event_log" TO athyperadmin;

GRANT SELECT ON TABLE "log"."workflow_event_log" TO athyperapp;

GRANT DELETE ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT INSERT ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."workflow_event_log_default" TO athyperadmin;

GRANT SELECT ON TABLE "log"."workflow_event_log_default" TO athyperapp;

GRANT DELETE ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT INSERT ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT REFERENCES ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT SELECT ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT TRIGGER ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT TRUNCATE ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT UPDATE ON TABLE "log"."workspace_usage_metric" TO athyperadmin;

GRANT SELECT ON TABLE "log"."workspace_usage_metric" TO athyperapp;
