-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

CREATE INDEX ai_action_policy_aap_tenant_action_idx ON ai.ai_action_policy USING btree (tenant_id, action_code, doc_class) WHERE is_active = true;

CREATE INDEX ai_confidence_threshold_act_tenant_action_idx ON ai.ai_confidence_threshold USING btree (tenant_id, action_code, doc_class, model_id) WHERE is_active = true;

CREATE UNIQUE INDEX ai_drift_baseline_adb_current_uq ON ai.ai_drift_baseline USING btree (tenant_id, action_code, COALESCE(doc_class, ''::text), model_id) WHERE is_current = true;

CREATE INDEX ai_drift_baseline_adb_scope_history_idx ON ai.ai_drift_baseline USING btree (tenant_id, action_code, model_id, baseline_date DESC);

CREATE INDEX atlas_conversation_retention_active_idx ON ai.atlas_conversation_retention_policy USING btree (tenant_id, revision DESC) WHERE status = 'active'::text;

CREATE UNIQUE INDEX atlas_tenant_provider_credential_active_uq ON ai.atlas_tenant_provider_credential USING btree (tenant_id, provider_id) WHERE status = 'active'::text;

CREATE INDEX atlas_tenant_provider_credential_rotation_idx ON ai.atlas_tenant_provider_credential USING btree (tenant_id, key_version, status);

-- ============================================================================
-- event/04_indexes.sql
-- Non-constraint indexes reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE INDEX ai_tool_invocation_business_ref_idx ON ai.ai_tool_invocation USING btree (tenant_id, business_transaction_type, business_transaction_id) WHERE business_transaction_id IS NOT NULL;

CREATE INDEX ai_tool_invocation_confirmation_expiry_idx ON ai.ai_tool_invocation USING btree (confirmation_expires_at) WHERE (status = ANY (ARRAY['proposed'::text, 'confirmed'::text])) AND confirmation_required = true;

CREATE UNIQUE INDEX ai_tool_invocation_confirmation_hash_uq ON ai.ai_tool_invocation USING btree (tenant_id, confirmation_token_hash) WHERE confirmation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX ai_tool_invocation_downstream_idempotency_uq ON ai.ai_tool_invocation USING btree (tenant_id, downstream_command_idempotency_key) WHERE downstream_command_idempotency_key IS NOT NULL;

CREATE INDEX ai_tool_invocation_open_idx ON ai.ai_tool_invocation USING btree (tenant_id, status, created_at) WHERE status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text]);

CREATE INDEX ai_tool_invocation_principal_history_idx ON ai.ai_tool_invocation USING btree (tenant_id, plane, principal_id, created_at DESC);

CREATE INDEX ai_tool_invocation_run_history_idx ON ai.ai_tool_invocation USING btree (tenant_id, run_id, created_at, id);

CREATE INDEX ai_tool_invocation_thread_history_idx ON ai.ai_tool_invocation USING btree (tenant_id, thread_id, created_at DESC, id);

CREATE INDEX atlas_run_cancel_requested_idx ON ai.atlas_run USING btree (cancellation_requested_at) WHERE status = 'started'::text AND cancellation_requested_at IS NOT NULL;

CREATE UNIQUE INDEX atlas_run_metering_uq ON ai.atlas_run USING btree (tenant_id, metering_run_id) WHERE metering_run_id IS NOT NULL;

CREATE UNIQUE INDEX atlas_run_one_started_per_thread_uq ON ai.atlas_run USING btree (tenant_id, conversation_id) WHERE status = 'started'::text;

CREATE INDEX atlas_run_principal_history_idx ON ai.atlas_run USING btree (tenant_id, plane, principal_id, started_at DESC);

CREATE INDEX atlas_run_thread_history_idx ON ai.atlas_run USING btree (tenant_id, conversation_id, started_at DESC, id);

CREATE INDEX ai_agent_call_aac_credential_pidx ON ai.ai_agent_call USING btree (tenant_id, credential_fingerprint, created_at DESC) WHERE credential_fingerprint IS NOT NULL;

CREATE INDEX ai_agent_call_aac_credential_reference_pidx ON ai.ai_agent_call USING btree (tenant_id, credential_reference_hash, created_at DESC) WHERE credential_reference_hash IS NOT NULL;

CREATE INDEX ai_agent_call_aac_operation_pidx ON ai.ai_agent_call USING btree (tenant_id, call_kind, operation_id, created_at DESC) WHERE operation_id IS NOT NULL;

CREATE INDEX ai_agent_call_aac_provider_model_idx ON ai.ai_agent_call USING btree (tenant_id, provider_id, actual_model_id, created_at DESC) WHERE provider_id IS NOT NULL;

CREATE INDEX ai_agent_call_aac_provider_request_pidx ON ai.ai_agent_call USING btree (provider_id, provider_request_id) WHERE provider_request_id IS NOT NULL;

CREATE INDEX ai_agent_run_aar_client_request_idx ON ai.ai_agent_run USING btree (tenant_id, client_request_id, created_at DESC);

CREATE INDEX ai_agent_run_aar_failure_pidx ON ai.ai_agent_run USING btree (tenant_id, error_category, created_at DESC) WHERE outcome = 'failed'::text;

CREATE INDEX ai_agent_run_aar_model_idx ON ai.ai_agent_run USING btree (tenant_id, resolved_provider_id, actual_model_id, created_at DESC) WHERE resolved_provider_id IS NOT NULL;

CREATE INDEX ai_agent_run_aar_thread_idx ON ai.ai_agent_run USING btree (tenant_id, principal_id, thread_id, created_at DESC);

CREATE INDEX ai_calibration_log_acl_model_idx ON ai.ai_calibration_log USING btree (tenant_id, model_id, created_at DESC) WHERE model_id IS NOT NULL;

CREATE INDEX act_entity_pidx ON ai.ai_call_transcript USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX act_session_idx ON ai.ai_call_transcript USING btree (tenant_id, session_id, created_at DESC);

CREATE INDEX ai_feedback_log_afl_entity_idx ON ai.ai_feedback_log USING btree (tenant_id, entity_type, entity_id) WHERE entity_id IS NOT NULL;

CREATE INDEX ai_feedback_log_afl_unverified_pidx ON ai.ai_feedback_log USING btree (tenant_id, feedback_type, created_at DESC) WHERE is_outcome_verified = false;

CREATE INDEX ai_inference_log_ail_model_idx ON ai.ai_inference_log USING btree (tenant_id, model_id, created_at DESC);

CREATE INDEX ai_inference_log_ail_reversal_pidx ON ai.ai_inference_log USING btree (tenant_id, reversal_window_expires_at) WHERE inference_type = 'action'::text AND reversed_at IS NULL AND reversal_window_expires_at IS NOT NULL;

CREATE INDEX ai_inference_log_ail_txn_pidx ON ai.ai_inference_log USING btree (tenant_id, txn_id) WHERE txn_id IS NOT NULL;

CREATE INDEX ai_inference_log_ail_unreviewed_pidx ON ai.ai_inference_log USING btree (tenant_id, created_at DESC) WHERE inference_type = 'prediction'::text AND is_accepted IS NULL;

CREATE INDEX ai_monitoring_log_aml_alert_pidx ON ai.ai_monitoring_log USING btree (tenant_id, monitor_type, created_at DESC) WHERE is_alert = true AND is_alert_sent = false;

CREATE INDEX ai_monitoring_log_aml_model_idx ON ai.ai_monitoring_log USING btree (tenant_id, model_id, created_at DESC) WHERE model_id IS NOT NULL;

CREATE INDEX atlas_knowledge_chunk_ready_idx ON ai.atlas_knowledge_chunk USING btree (tenant_id, revision_id, ordinal) WHERE index_status = 'ready'::text;

CREATE INDEX atlas_knowledge_revision_ready_idx ON ai.atlas_knowledge_revision USING btree (tenant_id, source_id, id) WHERE status = 'ready'::text;

CREATE INDEX atlas_knowledge_source_active_idx ON ai.atlas_knowledge_source USING btree (tenant_id, id) WHERE status = 'active'::text;

CREATE INDEX atlas_message_page_idx ON ai.atlas_message USING btree (tenant_id, conversation_id, sequence DESC);

CREATE INDEX atlas_message_parent_idx ON ai.atlas_message USING btree (tenant_id, conversation_id, parent_message_id) WHERE parent_message_id IS NOT NULL;

CREATE INDEX atlas_message_run_idx ON ai.atlas_message USING btree (tenant_id, run_id, sequence) WHERE run_id IS NOT NULL;

CREATE INDEX atlas_thread_expiry_idx ON ai.atlas_thread USING btree (expires_at) WHERE expires_at IS NOT NULL AND legal_hold = false;

CREATE INDEX atlas_thread_owner_history_idx ON ai.atlas_thread USING btree (tenant_id, plane, owner_principal_id, updated_at DESC NULLS LAST, conversation_id);

CREATE INDEX atlas_thread_purge_idx ON ai.atlas_thread USING btree (purge_after) WHERE purge_after IS NOT NULL AND legal_hold = false;
