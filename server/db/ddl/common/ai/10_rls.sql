-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

ALTER TABLE "ai"."ai_action_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_action_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_confidence_threshold" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_confidence_threshold" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_drift_baseline" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_drift_baseline" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_conversation_retention_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_conversation_retention_policy" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_tenant_provider_credential" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_tenant_provider_credential" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_tenant_provider_credential_epoch" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_tenant_provider_credential_epoch" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_tenant_quota_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."atlas_tenant_quota_policy" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai"."atlas_tenant_quota_window" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."atlas_tenant_quota_window" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ai"."atlas_tenant_quota_reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai"."atlas_tenant_quota_reservation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_write" ON "ai"."ai_action_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."ai_action_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "ai"."ai_action_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "ai"."ai_confidence_threshold"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."ai_confidence_threshold"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "ai"."ai_confidence_threshold"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "ai"."ai_drift_baseline"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."ai_drift_baseline"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "ai"."ai_drift_baseline"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "ai"."atlas_conversation_retention_policy"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."atlas_conversation_retention_policy"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_write" ON "ai"."atlas_conversation_retention_policy"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "atlas_byok_tenant_scope" ON "ai"."atlas_tenant_provider_credential"
  AS PERMISSIVE
  FOR ALL
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "atlas_byok_epoch_tenant_scope" ON "ai"."atlas_tenant_provider_credential_epoch"
  AS PERMISSIVE
  FOR ALL
  TO athyperapp
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "ai"."atlas_tenant_quota_policy" FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY "tenant_scope" ON "ai"."atlas_tenant_quota_policy" FOR ALL TO PUBLIC USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY "admin_write" ON "ai"."atlas_tenant_quota_window" FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY "tenant_scope" ON "ai"."atlas_tenant_quota_window" FOR ALL TO PUBLIC USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY "admin_write" ON "ai"."atlas_tenant_quota_reservation" FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY "tenant_scope" ON "ai"."atlas_tenant_quota_reservation" FOR ALL TO PUBLIC USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());

-- ============================================================================
-- event/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "ai"."ai_tool_invocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_tool_invocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_run" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "ai"."ai_tool_invocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_tool_invocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "ai"."ai_tool_invocation"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND created_by = principal_id AND status = 'proposed'::text AND updated_by IS NULL);

CREATE POLICY "tenant_read" ON "ai"."ai_tool_invocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (ai.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "ai"."ai_tool_invocation"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperapp
  USING (ai.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND updated_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "ai"."atlas_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."atlas_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "ai"."atlas_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND created_by = principal_id AND status = 'started'::text AND metering_run_id IS NULL);

CREATE POLICY "tenant_read" ON "ai"."atlas_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (ai.fn_atlas_conversation_access(tenant_id, conversation_id, false));

CREATE POLICY "tenant_update" ON "ai"."atlas_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

ALTER TABLE "ai"."ai_agent_call" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_agent_call" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_agent_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_agent_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_calibration_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_calibration_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_call_transcript" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_call_transcript" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_feedback_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_feedback_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_inference_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_inference_log" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_monitoring_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."ai_monitoring_log" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "ai"."ai_agent_call"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_agent_call"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_agent_call"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_agent_call"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_agent_call"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_agent_call"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "ai"."ai_agent_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_agent_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_agent_run"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_agent_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_agent_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_agent_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "ai"."ai_calibration_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_calibration_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_calibration_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_calibration_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_calibration_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_calibration_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "ai"."ai_call_transcript"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_call_transcript"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_call_transcript"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_call_transcript"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_call_transcript"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_call_transcript"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_call_transcript_default"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_call_transcript_default"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "admin_read" ON "ai"."ai_feedback_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_feedback_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_feedback_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_feedback_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_feedback_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_feedback_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "ai"."ai_inference_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_inference_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_inference_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_inference_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_inference_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_inference_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "ai"."ai_monitoring_log"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."ai_monitoring_log"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_deny_delete" ON "ai"."ai_monitoring_log"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_deny_update" ON "ai"."ai_monitoring_log"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (false);

CREATE POLICY "tenant_insert" ON "ai"."ai_monitoring_log"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "ai"."ai_monitoring_log"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

ALTER TABLE "ai"."atlas_knowledge_chunk" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_knowledge_chunk" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_knowledge_revision" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_knowledge_revision" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_knowledge_source" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_knowledge_source" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_message" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_message" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_thread" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ai"."atlas_thread" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_write" ON "ai"."atlas_knowledge_chunk"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."atlas_knowledge_chunk"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "ai"."atlas_knowledge_revision"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."atlas_knowledge_revision"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "ai"."atlas_knowledge_source"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_read" ON "ai"."atlas_knowledge_source"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "ai"."atlas_message"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."atlas_message"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "ai"."atlas_message"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "ai"."atlas_message"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (ai.fn_atlas_conversation_access(tenant_id, conversation_id, false));

CREATE POLICY "tenant_update" ON "ai"."atlas_message"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND created_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "atlas_maintenance_read" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin_atlas_maintenance
  USING (true);

CREATE POLICY "atlas_maintenance_write" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperadmin_atlas_maintenance
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND owner_principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND created_by = owner_principal_id AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text));

CREATE POLICY "tenant_read" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (ai.fn_atlas_conversation_access(tenant_id, conversation_id, false));

CREATE POLICY "tenant_update" ON "ai"."atlas_thread"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true))
  WITH CHECK (ai.fn_atlas_conversation_access(tenant_id, conversation_id, true));
ALTER TABLE ai.ai_call_transcript_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.ai_call_transcript_default FORCE ROW LEVEL SECURITY;

ALTER TABLE ai.atlas_provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.atlas_provider_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY actor_access ON ai.atlas_provider_usage
  FOR ALL TO PUBLIC
  USING (EXISTS (
    SELECT 1 FROM ai.atlas_run r
    WHERE r.id = run_id
      AND r.tenant_id = atlas_provider_usage.tenant_id
      AND r.principal_id = NULLIF(current_setting('app.current_principal_id', true), '')::uuid
      AND r.plane = NULLIF(current_setting('app.current_atlas_plane', true), '')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai.atlas_run r
    WHERE r.id = run_id
      AND r.tenant_id = atlas_provider_usage.tenant_id
      AND r.principal_id = NULLIF(current_setting('app.current_principal_id', true), '')::uuid
      AND r.plane = NULLIF(current_setting('app.current_atlas_plane', true), '')
  ));
