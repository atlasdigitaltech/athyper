-- ============================================================================
-- event/08_rls.sql
-- Row-level security policies and explicit object grants.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE "event"."ai_tool_invocation" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."ai_tool_invocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."atlas_run" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."atlas_run" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."comment_flag" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."comment_flag" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."digest_staging" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."digest_staging" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_document_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_document_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_event" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_event" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_idempotency" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_idempotency" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_node_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."document_runtime_node_version" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."lifecycle_timer_schedule" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."lifecycle_timer_schedule" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."notification_delivery" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."notification_delivery" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."notification_delivery_claim" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."notification_delivery_claim" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."notification_message" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."notification_message" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."outbox" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."outbox" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."webhook_subscription" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."webhook_subscription" FORCE ROW LEVEL SECURITY;

ALTER TABLE "event"."work_item" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "event"."work_item" FORCE ROW LEVEL SECURITY;

CREATE POLICY "admin_read" ON "event"."ai_tool_invocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."ai_tool_invocation"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."ai_tool_invocation"
  AS PERMISSIVE
  FOR INSERT
  TO athyperapp
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND created_by = principal_id AND status = 'proposed'::text AND updated_by IS NULL);

CREATE POLICY "tenant_read" ON "event"."ai_tool_invocation"
  AS PERMISSIVE
  FOR SELECT
  TO athyperapp
  USING (master.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "event"."ai_tool_invocation"
  AS PERMISSIVE
  FOR UPDATE
  TO athyperapp
  USING (master.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, thread_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND updated_by = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_read" ON "event"."atlas_run"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."atlas_run"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."atlas_run"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND plane = NULLIF(current_setting('app.current_atlas_plane'::text, true), ''::text) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid AND created_by = principal_id AND status = 'started'::text AND metering_run_id IS NULL);

CREATE POLICY "tenant_read" ON "event"."atlas_run"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (master.fn_atlas_conversation_access(tenant_id, conversation_id, false));

CREATE POLICY "tenant_update" ON "event"."atlas_run"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (master.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (master.fn_atlas_conversation_access(tenant_id, conversation_id, true) AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "authorization_v2_epoch_read" ON "event"."authorization_global_epoch_v2"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "authorization_v2_epoch_read" ON "event"."authorization_plane_epoch_v2"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "authorization_v2_epoch_read" ON "event"."authorization_tenant_epoch_v2"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "event"."comment_flag"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."comment_flag"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."comment_flag"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."comment_flag"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "event"."digest_staging"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."digest_staging"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."digest_staging"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."digest_staging"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."digest_staging"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "event"."document_runtime_document_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."document_runtime_document_version"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."document_runtime_document_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."document_runtime_document_version"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_write" ON "event"."document_runtime_event"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."document_runtime_event"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."document_runtime_event"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_write" ON "event"."document_runtime_idempotency"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."document_runtime_idempotency"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_read" ON "event"."document_runtime_idempotency"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "tenant_update" ON "event"."document_runtime_idempotency"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid)
  WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = NULLIF(current_setting('app.current_principal_id'::text, true), ''::text)::uuid);

CREATE POLICY "admin_write" ON "event"."document_runtime_node_version"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."document_runtime_node_version"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."document_runtime_node_version"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."document_runtime_node_version"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "event"."lifecycle_timer_schedule"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."lifecycle_timer_schedule"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."lifecycle_timer_schedule"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."lifecycle_timer_schedule"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."lifecycle_timer_schedule"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "event"."notification_delivery"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."notification_delivery"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."notification_delivery"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."notification_delivery"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."notification_delivery"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "event"."notification_delivery_claim"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."notification_delivery_claim"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "event"."notification_delivery_claim"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "event"."notification_delivery_claim"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."notification_delivery_claim"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."notification_delivery_claim"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "event"."notification_message"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."notification_message"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."notification_message"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."notification_message"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."notification_message"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "event"."outbox"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."outbox"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."outbox"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."outbox"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "admin_read" ON "event"."webhook_subscription"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."webhook_subscription"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_delete" ON "event"."webhook_subscription"
  AS PERMISSIVE
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_insert" ON "event"."webhook_subscription"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."webhook_subscription"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."webhook_subscription"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "admin_read" ON "event"."work_item"
  AS PERMISSIVE
  FOR SELECT
  TO athyperadmin
  USING (true);

CREATE POLICY "admin_write" ON "event"."work_item"
  AS PERMISSIVE
  FOR ALL
  TO athyperadmin
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_insert" ON "event"."work_item"
  AS PERMISSIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY "tenant_read" ON "event"."work_item"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());

CREATE POLICY "tenant_update" ON "event"."work_item"
  AS PERMISSIVE
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = shared.current_tenant_id())
  WITH CHECK (tenant_id = shared.current_tenant_id());

GRANT EXECUTE ON FUNCTION "event".fn_authorization_bump_epoch_v2(p_scope_kind text, p_tenant_id uuid, p_plane_code text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".fn_authorization_claim_invalidations_v2(p_worker_id text, p_batch_size integer, p_lease_seconds integer) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".fn_authorization_complete_invalidation_v2(p_id uuid, p_worker_id text) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".fn_authorization_emit_invalidation_v2(p_idempotency_key text, p_scope_kind text, p_tenant_id uuid, p_plane_code text, p_authority_schema text, p_authority_table text, p_authority_operation character, p_source_row_key jsonb, p_boundary_kind text, p_effective_at timestamp with time zone, p_affected_principal_ids uuid[], p_affected_group_ids uuid[], p_affected_role_ids uuid[], p_affected_permission_set_ids uuid[], p_affected_permission_ids uuid[], p_affected_scope_ids uuid[], p_affected_record_ids uuid[], p_affected_delegation_ids uuid[], p_cause_source_database_id uuid, p_cause_source_watermark bigint, p_cause_replay_transaction_id uuid, p_correlation_id uuid) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".fn_authorization_fail_invalidation_v2(p_id uuid, p_worker_id text, p_error text, p_retry_seconds integer) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".fn_authorization_supersede_scheduled_v2(p_authority_schema text, p_authority_table text, p_source_row_key jsonb) TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".trg_authorization_authority_invalidate_v2() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".trg_authorization_invalidation_immutable_v2() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".trg_guard_atlas_run_mutation() TO athyperadmin;

GRANT EXECUTE ON FUNCTION "event".trg_validate_atlas_run_messages() TO athyperadmin;

GRANT DELETE ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT INSERT ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT SELECT ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."ai_tool_invocation" TO athyperadmin;

GRANT INSERT ON TABLE "event"."ai_tool_invocation" TO athyperapp;

GRANT SELECT ON TABLE "event"."ai_tool_invocation" TO athyperapp;

GRANT UPDATE ON TABLE "event"."ai_tool_invocation" TO athyperapp;

GRANT DELETE ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT INSERT ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT SELECT ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."atlas_run" TO athyperadmin;

GRANT INSERT ON TABLE "event"."atlas_run" TO athyperapp;

GRANT SELECT ON TABLE "event"."atlas_run" TO athyperapp;

GRANT UPDATE ON TABLE "event"."atlas_run" TO athyperapp;

GRANT DELETE ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT INSERT ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."authorization_global_epoch_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_global_epoch_v2" TO athyperapp;

GRANT DELETE ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT INSERT ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_invalidation_outbox_v2" TO athyperapp;

GRANT DELETE ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT INSERT ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."authorization_plane_epoch_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_plane_epoch_v2" TO athyperapp;

GRANT DELETE ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT INSERT ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."authorization_tenant_epoch_v2" TO athyperapp;

GRANT DELETE ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT INSERT ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT SELECT ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."comment_flag" TO athyperadmin;

GRANT SELECT ON TABLE "event"."comment_flag" TO athyperapp;

GRANT DELETE ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT INSERT ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT SELECT ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."connector_instance" TO athyperadmin;

GRANT SELECT ON TABLE "event"."connector_instance" TO athyperapp;

GRANT DELETE ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT INSERT ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT SELECT ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."digest_staging" TO athyperadmin;

GRANT SELECT ON TABLE "event"."digest_staging" TO athyperapp;

GRANT DELETE ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT INSERT ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."document_runtime_document_version" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_document_version" TO athyperapp;

GRANT DELETE ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT INSERT ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."document_runtime_event" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_event" TO athyperapp;

GRANT DELETE ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT INSERT ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."document_runtime_idempotency" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_idempotency" TO athyperapp;

GRANT DELETE ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT INSERT ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."document_runtime_node_version" TO athyperadmin;

GRANT SELECT ON TABLE "event"."document_runtime_node_version" TO athyperapp;

GRANT DELETE ON TABLE "event"."endpoint" TO athyperadmin;

GRANT INSERT ON TABLE "event"."endpoint" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."endpoint" TO athyperadmin;

GRANT SELECT ON TABLE "event"."endpoint" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."endpoint" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."endpoint" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."endpoint" TO athyperadmin;

GRANT SELECT ON TABLE "event"."endpoint" TO athyperapp;

GRANT DELETE ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT INSERT ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."lifecycle_timer_schedule" TO athyperadmin;

GRANT SELECT ON TABLE "event"."lifecycle_timer_schedule" TO athyperapp;

GRANT DELETE ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT INSERT ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."notification_delivery" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_delivery" TO athyperapp;

GRANT DELETE ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT INSERT ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."notification_delivery_claim" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_delivery_claim" TO athyperapp;

GRANT DELETE ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT INSERT ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."notification_delivery_default" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_delivery_default" TO athyperapp;

GRANT DELETE ON TABLE "event"."notification_message" TO athyperadmin;

GRANT INSERT ON TABLE "event"."notification_message" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."notification_message" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_message" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."notification_message" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."notification_message" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."notification_message" TO athyperadmin;

GRANT SELECT ON TABLE "event"."notification_message" TO athyperapp;

GRANT DELETE ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT INSERT ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT SELECT ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."orchestration_node" TO athyperadmin;

GRANT SELECT ON TABLE "event"."orchestration_node" TO athyperapp;

GRANT DELETE ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT INSERT ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT SELECT ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."orchestration_run" TO athyperadmin;

GRANT SELECT ON TABLE "event"."orchestration_run" TO athyperapp;

GRANT DELETE ON TABLE "event"."outbox" TO athyperadmin;

GRANT INSERT ON TABLE "event"."outbox" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."outbox" TO athyperadmin;

GRANT SELECT ON TABLE "event"."outbox" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."outbox" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."outbox" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."outbox" TO athyperadmin;

GRANT SELECT ON TABLE "event"."outbox" TO athyperapp;

GRANT DELETE ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT INSERT ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT SELECT ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."push_subscription" TO athyperadmin;

GRANT SELECT ON TABLE "event"."push_subscription" TO athyperapp;

GRANT DELETE ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT INSERT ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperadmin;

GRANT SELECT ON TABLE "event"."v_authorization_invalidation_health_v2" TO athyperapp;

GRANT DELETE ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT INSERT ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT SELECT ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."webhook_subscription" TO athyperadmin;

GRANT SELECT ON TABLE "event"."webhook_subscription" TO athyperapp;

GRANT DELETE ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT INSERT ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT SELECT ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."whatsapp_consent" TO athyperadmin;

GRANT SELECT ON TABLE "event"."whatsapp_consent" TO athyperapp;

GRANT DELETE ON TABLE "event"."work_item" TO athyperadmin;

GRANT INSERT ON TABLE "event"."work_item" TO athyperadmin;

GRANT REFERENCES ON TABLE "event"."work_item" TO athyperadmin;

GRANT SELECT ON TABLE "event"."work_item" TO athyperadmin;

GRANT TRIGGER ON TABLE "event"."work_item" TO athyperadmin;

GRANT TRUNCATE ON TABLE "event"."work_item" TO athyperadmin;

GRANT UPDATE ON TABLE "event"."work_item" TO athyperadmin;

GRANT SELECT ON TABLE "event"."work_item" TO athyperapp;
