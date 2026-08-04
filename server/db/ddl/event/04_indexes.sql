-- ============================================================================
-- event/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX ai_tool_invocation_business_ref_idx ON event.ai_tool_invocation USING btree (tenant_id, business_transaction_type, business_transaction_id) WHERE business_transaction_id IS NOT NULL;

CREATE INDEX ai_tool_invocation_confirmation_expiry_idx ON event.ai_tool_invocation USING btree (confirmation_expires_at) WHERE (status = ANY (ARRAY['proposed'::text, 'confirmed'::text])) AND confirmation_required = true;

CREATE UNIQUE INDEX ai_tool_invocation_confirmation_hash_uq ON event.ai_tool_invocation USING btree (tenant_id, confirmation_token_hash) WHERE confirmation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX ai_tool_invocation_downstream_idempotency_uq ON event.ai_tool_invocation USING btree (tenant_id, downstream_command_idempotency_key) WHERE downstream_command_idempotency_key IS NOT NULL;

CREATE INDEX ai_tool_invocation_open_idx ON event.ai_tool_invocation USING btree (tenant_id, status, created_at) WHERE status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text]);

CREATE INDEX ai_tool_invocation_principal_history_idx ON event.ai_tool_invocation USING btree (tenant_id, plane, principal_id, created_at DESC);

CREATE INDEX ai_tool_invocation_run_history_idx ON event.ai_tool_invocation USING btree (tenant_id, run_id, created_at, id);

CREATE INDEX ai_tool_invocation_thread_history_idx ON event.ai_tool_invocation USING btree (tenant_id, thread_id, created_at DESC, id);

CREATE INDEX atlas_run_cancel_requested_idx ON event.atlas_run USING btree (cancellation_requested_at) WHERE status = 'started'::text AND cancellation_requested_at IS NOT NULL;

CREATE UNIQUE INDEX atlas_run_metering_uq ON event.atlas_run USING btree (tenant_id, metering_run_id) WHERE metering_run_id IS NOT NULL;

CREATE UNIQUE INDEX atlas_run_one_started_per_thread_uq ON event.atlas_run USING btree (tenant_id, conversation_id) WHERE status = 'started'::text;

CREATE INDEX atlas_run_principal_history_idx ON event.atlas_run USING btree (tenant_id, plane, principal_id, started_at DESC);

CREATE INDEX atlas_run_thread_history_idx ON event.atlas_run USING btree (tenant_id, conversation_id, started_at DESC, id);

CREATE INDEX authorization_invalidation_outbox_v2_claim_idx ON event.authorization_invalidation_outbox_v2 USING btree (available_at, created_at, id) WHERE status = ANY (ARRAY['pending'::text, 'failed'::text]);

CREATE INDEX authorization_invalidation_outbox_v2_group_gin ON event.authorization_invalidation_outbox_v2 USING gin (affected_group_ids);

CREATE INDEX authorization_invalidation_outbox_v2_lease_idx ON event.authorization_invalidation_outbox_v2 USING btree (locked_until, id) WHERE status = 'processing'::text;

CREATE INDEX authorization_invalidation_outbox_v2_permission_gin ON event.authorization_invalidation_outbox_v2 USING gin (affected_permission_ids);

CREATE INDEX authorization_invalidation_outbox_v2_principal_gin ON event.authorization_invalidation_outbox_v2 USING gin (affected_principal_ids);

CREATE INDEX authorization_invalidation_outbox_v2_role_gin ON event.authorization_invalidation_outbox_v2 USING gin (affected_role_ids);

CREATE INDEX authorization_invalidation_outbox_v2_scope_idx ON event.authorization_invalidation_outbox_v2 USING btree (scope_kind, tenant_id, plane_code, global_epoch, tenant_epoch, plane_epoch);

CREATE INDEX authorization_invalidation_outbox_v2_source_idx ON event.authorization_invalidation_outbox_v2 USING btree (authority_schema, authority_table, source_row_key, boundary_kind, available_at);

CREATE INDEX cf_comment_idx ON event.comment_flag USING btree (tenant_id, context_type, comment_id, created_at DESC);

CREATE INDEX cf_flagged_by_idx ON event.comment_flag USING btree (tenant_id, flagged_by, created_at DESC);

CREATE INDEX cf_pending_idx ON event.comment_flag USING btree (tenant_id, created_at DESC) WHERE status = 'pending'::text;

CREATE INDEX idx_connector_instance_health ON event.connector_instance USING btree (tenant_id, health_status) WHERE health_status = ANY (ARRAY['degraded'::text, 'down'::text]);

CREATE INDEX idx_connector_instance_tenant ON event.connector_instance USING btree (tenant_id, is_active, created_at DESC);

CREATE INDEX idx_connector_instance_type ON event.connector_instance USING btree (connector_type_id, tenant_id);

CREATE INDEX ds_stale_pidx ON event.digest_staging USING btree (staged_at) WHERE delivered_at IS NULL;

CREATE INDEX ds_worker_pickup_idx ON event.digest_staging USING btree (tenant_id, recipient_id, channel, frequency, staged_at) WHERE delivered_at IS NULL;

CREATE INDEX dre_document_cursor_idx ON event.document_runtime_event USING btree (tenant_id, entity_code, document_id, cursor);

CREATE INDEX dre_retention_idx ON event.document_runtime_event USING btree (retained_until);

CREATE INDEX dri_document_idx ON event.document_runtime_idempotency USING btree (tenant_id, entity_code, document_id, created_at DESC) WHERE document_id IS NOT NULL;

CREATE INDEX dri_expiry_idx ON event.document_runtime_idempotency USING btree (expires_at);

CREATE INDEX dri_in_progress_lease_idx ON event.document_runtime_idempotency USING btree (lease_expires_at) WHERE status = 'in_progress'::text;

CREATE INDEX drnv_document_idx ON event.document_runtime_node_version USING btree (tenant_id, entity_code, document_id, node_key);

CREATE INDEX lts_entity_scheduled_idx ON event.lifecycle_timer_schedule USING btree (tenant_id, entity_name, entity_id, state_id) WHERE status = 'scheduled'::text;

CREATE INDEX lts_worker_pickup_idx ON event.lifecycle_timer_schedule USING btree (fire_at) WHERE status = 'scheduled'::text;

CREATE INDEX ndlv_external_id_pidx ON ONLY event.notification_delivery USING btree (external_id) WHERE external_id IS NOT NULL;

CREATE INDEX ndlv_failed_pidx ON ONLY event.notification_delivery USING btree (tenant_id, channel, created_at DESC) WHERE status = ANY (ARRAY['failed'::text, 'bounced'::text]);

CREATE INDEX ndlv_message_idx ON ONLY event.notification_delivery USING btree (tenant_id, message_id, created_at DESC);

CREATE UNIQUE INDEX ndlv_message_recipient_channel_uq ON ONLY event.notification_delivery USING btree (tenant_id, message_id, recipient_id, channel, created_at) WHERE status <> 'cancelled'::text;

CREATE INDEX ndlv_recipient_idx ON ONLY event.notification_delivery USING btree (tenant_id, recipient_id, created_at DESC) WHERE recipient_id IS NOT NULL;

CREATE INDEX ndlv_subscription_pidx ON ONLY event.notification_delivery USING btree (tenant_id, subscription_id, created_at DESC) WHERE subscription_id IS NOT NULL;

CREATE INDEX ndlv_webhook_outbox_subscription_idx ON ONLY event.notification_delivery USING btree (tenant_id, outbox_id, subscription_id, created_at DESC) WHERE channel = 'webhook'::text AND outbox_id IS NOT NULL AND subscription_id IS NOT NULL;

CREATE INDEX ndlv_worker_pickup_pidx ON ONLY event.notification_delivery USING btree (channel, next_retry_at) WHERE status = ANY (ARRAY['pending'::text, 'queued'::text]);

CREATE INDEX ndcl_expiry_idx ON event.notification_delivery_claim USING btree (expires_at);

CREATE INDEX notification_delivery_default_channel_next_retry_at_idx ON event.notification_delivery_default USING btree (channel, next_retry_at) WHERE status = ANY (ARRAY['pending'::text, 'queued'::text]);

CREATE INDEX notification_delivery_default_external_id_idx ON event.notification_delivery_default USING btree (external_id) WHERE external_id IS NOT NULL;

CREATE INDEX notification_delivery_default_tenant_id_channel_created_at_idx ON event.notification_delivery_default USING btree (tenant_id, channel, created_at DESC) WHERE status = ANY (ARRAY['failed'::text, 'bounced'::text]);

CREATE INDEX notification_delivery_default_tenant_id_message_id_created__idx ON event.notification_delivery_default USING btree (tenant_id, message_id, created_at DESC);

CREATE UNIQUE INDEX notification_delivery_default_tenant_id_message_id_recipien_idx ON event.notification_delivery_default USING btree (tenant_id, message_id, recipient_id, channel, created_at) WHERE status <> 'cancelled'::text;

CREATE INDEX notification_delivery_default_tenant_id_outbox_id_subscript_idx ON event.notification_delivery_default USING btree (tenant_id, outbox_id, subscription_id, created_at DESC) WHERE channel = 'webhook'::text AND outbox_id IS NOT NULL AND subscription_id IS NOT NULL;

CREATE INDEX notification_delivery_default_tenant_id_recipient_id_create_idx ON event.notification_delivery_default USING btree (tenant_id, recipient_id, created_at DESC) WHERE recipient_id IS NOT NULL;

CREATE INDEX notification_delivery_default_tenant_id_subscription_id_cre_idx ON event.notification_delivery_default USING btree (tenant_id, subscription_id, created_at DESC) WHERE subscription_id IS NOT NULL;

CREATE INDEX nmsg_correlation_pidx ON event.notification_message USING btree (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX nmsg_delivering_pidx ON event.notification_message USING btree (tenant_id, created_at) WHERE status = ANY (ARRAY['pending'::text, 'planning'::text, 'delivering'::text]);

CREATE INDEX nmsg_entity_pidx ON event.notification_message USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX nmsg_event_idx ON event.notification_message USING btree (tenant_id, event_code, created_at DESC);

CREATE INDEX nmsg_tenant_created_idx ON event.notification_message USING btree (tenant_id, created_at DESC);

CREATE INDEX nmsg_tenant_plane_created_idx ON event.notification_message USING btree (tenant_id, plane_key, created_at DESC);

CREATE INDEX idx_orch_node_active ON event.orchestration_node USING btree (tenant_id, status) WHERE status = ANY (ARRAY['pending'::text, 'running'::text]);

CREATE INDEX idx_orch_node_job_id ON event.orchestration_node USING btree (job_id) WHERE job_id IS NOT NULL;

CREATE INDEX idx_orch_node_run_id ON event.orchestration_node USING btree (run_id);

CREATE INDEX idx_orch_run_correlation ON event.orchestration_run USING btree (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE INDEX idx_orch_run_dag ON event.orchestration_run USING btree (tenant_id, dag_id, started_at DESC);

CREATE INDEX idx_orch_run_tenant_status ON event.orchestration_run USING btree (tenant_id, status, started_at DESC);

CREATE INDEX outbox_completed_purge_pidx ON event.outbox USING btree (processed_at) WHERE status = 'completed'::text;

CREATE INDEX outbox_dead_letter_pidx ON event.outbox USING btree (topic, created_at) WHERE status = 'dead_letter'::text;

CREATE INDEX outbox_locked_pidx ON event.outbox USING btree (locked_at) WHERE status = 'processing'::text AND locked_at IS NOT NULL;

CREATE UNIQUE INDEX outbox_tenant_event_key_uq ON event.outbox USING btree (tenant_id, event_key) WHERE event_key IS NOT NULL;

CREATE INDEX outbox_tenant_status_idx ON event.outbox USING btree (tenant_id, status);

CREATE INDEX outbox_topic_available_pidx ON event.outbox USING btree (topic, available_at, created_at) WHERE status = ANY (ARRAY['pending'::text, 'failed'::text]);

CREATE INDEX outbox_topic_status_idx ON event.outbox USING btree (topic, status);

CREATE INDEX ps_expired_pidx ON event.push_subscription USING btree (expires_at) WHERE is_active = true AND expires_at IS NOT NULL;

CREATE INDEX ps_principal_plane_active_idx ON event.push_subscription USING btree (tenant_id, principal_id, plane_key) WHERE is_active = true;

CREATE INDEX wac_phone_lookup_idx ON event.whatsapp_consent USING btree (tenant_id, phone_e164) WHERE consent_status = 'opted_in'::text;

CREATE INDEX wac_principal_active_idx ON event.whatsapp_consent USING btree (tenant_id, principal_id) WHERE consent_status = 'opted_in'::text;

CREATE INDEX wi_assignee_active_idx ON event.work_item USING btree (tenant_id, assignee_id, due_at) WHERE (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text])) AND assignee_id IS NOT NULL;

CREATE INDEX wi_group_pending_idx ON event.work_item USING btree (tenant_id, assignee_group_id, created_at DESC) WHERE (status = ANY (ARRAY['pending'::text, 'assigned'::text])) AND assignee_group_id IS NOT NULL;

CREATE INDEX wi_overdue_pidx ON event.work_item USING btree (tenant_id, due_at) WHERE due_at IS NOT NULL AND (status = ANY (ARRAY['assigned'::text, 'in_progress'::text]));

CREATE INDEX wi_request_idx ON event.work_item USING btree (tenant_id, workflow_request_id, created_at DESC) WHERE workflow_request_id IS NOT NULL;

CREATE INDEX wi_stage_idx ON event.work_item USING btree (tenant_id, workflow_stage_id, order_index) WHERE workflow_stage_id IS NOT NULL;

CREATE INDEX wi_team_pending_idx ON event.work_item USING btree (tenant_id, assignee_team_id, created_at DESC) WHERE (status = ANY (ARRAY['pending'::text, 'assigned'::text])) AND assignee_team_id IS NOT NULL;
