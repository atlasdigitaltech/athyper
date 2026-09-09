-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_policy_pkey" PRIMARY KEY (tenant_id);

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_pkey" PRIMARY KEY (tenant_id, provider_id);

ALTER TABLE ONLY "ai"."atlas_tenant_quota_policy"
  ADD CONSTRAINT "atlas_tenant_quota_policy_pkey" PRIMARY KEY (tenant_id);

ALTER TABLE ONLY "ai"."atlas_tenant_quota_window"
  ADD CONSTRAINT "atlas_tenant_quota_window_pkey" PRIMARY KEY (tenant_id, window_started_at);

ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_natural_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, action_code, doc_class);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_natural_uq" UNIQUE NULLS NOT DISTINCT (tenant_id, action_code, doc_class, model_id);

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_scope_uq" UNIQUE (tenant_id, provider_id, rotation_epoch);

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_action_nonempty" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_autonomy_chk" CHECK (autonomy_level = ANY (ARRAY['disabled'::text, 'suggest'::text, 'assist'::text, 'auto'::text]));

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_confidence_chk" CHECK (min_confidence_for_auto IS NULL OR min_confidence_for_auto >= 0::numeric AND min_confidence_for_auto <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_effective_order" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_action_nonempty" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_assist_chk" CHECK (min_for_assist >= 0::numeric AND min_for_assist <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_auto_chk" CHECK (min_for_auto >= 0::numeric AND min_for_auto <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_drift_chk" CHECK (drift_alert_below IS NULL OR drift_alert_below >= 0::numeric AND drift_alert_below <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_suggest_chk" CHECK (min_for_suggest >= 0::numeric AND min_for_suggest <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_threshold_order" CHECK (min_for_suggest <= min_for_assist AND min_for_assist <= min_for_auto);

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_window_pos" CHECK (drift_window_hours > 0);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_action_nonempty" CHECK (btrim(action_code) <> ''::text);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_feature_chk" CHECK (feature_stats IS NULL OR jsonb_typeof(feature_stats) = 'object'::text);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_mean_range_chk" CHECK (mean_confidence >= 0::numeric AND mean_confidence <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_model_nonempty" CHECK (btrim(model_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_p5_range_chk" CHECK (p5_confidence IS NULL OR p5_confidence >= 0::numeric AND p5_confidence <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_p95_range_chk" CHECK (p95_confidence IS NULL OR p95_confidence >= 0::numeric AND p95_confidence <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_percentile_order" CHECK (p5_confidence IS NULL OR p95_confidence IS NULL OR p5_confidence <= p95_confidence);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_sample_pos" CHECK (sample_size > 0);

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_std_nonneg_chk" CHECK (std_dev_confidence >= 0::numeric);

ALTER TABLE ONLY "ai"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_days_chk" CHECK (retention_days >= 1 AND retention_days <= 3650);

ALTER TABLE ONLY "ai"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_effective_chk" CHECK (effective_to IS NULL OR effective_to > effective_from);

ALTER TABLE ONLY "ai"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_revision_chk" CHECK (revision >= 1);

ALTER TABLE ONLY "ai"."atlas_conversation_retention_policy"
  ADD CONSTRAINT "atlas_conversation_retention_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]));

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_chk" CHECK (rotation_epoch >= 1 AND key_version >= 1);

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_provider_chk" CHECK (provider_id = ANY (ARRAY['anthropic'::text, 'openai'::text, 'gemini'::text]));

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_revoke_chk" CHECK (status = 'revoked'::text AND revoked_at IS NOT NULL OR status <> 'revoked'::text);

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'superseded'::text, 'revoked'::text]));

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_rotation_epoch_check" CHECK (rotation_epoch >= 1);

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_epoch_provider_chk" CHECK (provider_id = ANY (ARRAY['anthropic'::text, 'openai'::text, 'gemini'::text]));

ALTER TABLE ONLY "ai"."atlas_tenant_quota_policy"
  ADD CONSTRAINT "atlas_tenant_quota_policy_limits_chk" CHECK (max_requests > 0 AND max_input_tokens > 0 AND max_output_tokens > 0 AND window_seconds > 0 AND revision > 0);

ALTER TABLE ONLY "ai"."atlas_tenant_quota_window"
  ADD CONSTRAINT "atlas_tenant_quota_window_values_chk" CHECK (window_ends_at > window_started_at AND used_requests >= 0 AND used_input_tokens >= 0 AND used_output_tokens >= 0 AND reserved_input_tokens >= 0 AND reserved_output_tokens >= 0);

ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_values_chk" CHECK (reserved_input_tokens >= 0 AND reserved_output_tokens >= 0 AND (actual_input_tokens IS NULL OR actual_input_tokens >= 0) AND (actual_output_tokens IS NULL OR actual_output_tokens >= 0) AND expires_at > created_at);

ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_status_chk" CHECK (status = ANY (ARRAY['reserved'::text, 'settled'::text, 'released'::text, 'expired'::text]));

ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_terminal_chk" CHECK ((status = 'settled' AND settled_at IS NOT NULL AND actual_input_tokens IS NOT NULL AND actual_output_tokens IS NOT NULL) OR (status IN ('released','expired') AND released_at IS NOT NULL) OR status = 'reserved');

-- Every mutable AI relation keeps the actor/time columns as an atomic pair.
ALTER TABLE ai.ai_action_policy
  ADD CONSTRAINT ai_action_policy_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.ai_confidence_threshold
  ADD CONSTRAINT ai_confidence_threshold_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.ai_drift_baseline
  ADD CONSTRAINT ai_drift_baseline_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_conversation_retention_policy
  ADD CONSTRAINT atlas_conversation_retention_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_tenant_provider_credential
  ADD CONSTRAINT atlas_tenant_provider_credential_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_tenant_provider_credential_epoch
  ADD CONSTRAINT atlas_tenant_provider_epoch_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_tenant_quota_policy
  ADD CONSTRAINT atlas_tenant_quota_policy_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_tenant_quota_window
  ADD CONSTRAINT atlas_tenant_quota_window_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_tenant_quota_reservation
  ADD CONSTRAINT atlas_tenant_quota_reservation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.ai_tool_invocation
  ADD CONSTRAINT ai_tool_invocation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_run
  ADD CONSTRAINT atlas_run_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_knowledge_source
  ADD CONSTRAINT atlas_knowledge_source_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_message
  ADD CONSTRAINT atlas_message_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));
ALTER TABLE ai.atlas_thread
  ADD CONSTRAINT atlas_thread_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL));

-- ============================================================================
-- event/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_call_uq" UNIQUE (tenant_id, run_id, tool_call_id);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_scope_id_uq" UNIQUE (tenant_id, thread_id, plane, id);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_client_request_uq" UNIQUE (tenant_id, client_request_id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_input_uq" UNIQUE (tenant_id, conversation_id, plane, input_message_id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_output_uq" UNIQUE (tenant_id, conversation_id, plane, output_message_id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_scope_id_uq" UNIQUE (tenant_id, conversation_id, plane, id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_action_code_chk" CHECK (action_code IS NULL OR action_code ~ '^[a-z][a-z0-9_.:-]{0,127}$'::text);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_authorization_epoch_chk" CHECK (authorization_epoch >= 0);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_autonomy_chk" CHECK (autonomy_decision = ANY (ARRAY['not_evaluated'::text, 'denied'::text, 'suggest'::text, 'assist'::text, 'auto'::text]));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_bounded_json_chk" CHECK (octet_length(permission_snapshot::text) <= 32768 AND octet_length(policy_snapshot::text) <= 32768 AND octet_length(profile_snapshot::text) <= 32768 AND (execution_guard_snapshot IS NULL OR octet_length(execution_guard_snapshot::text) <= 32768) AND octet_length(evidence_refs::text) <= 65536);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_business_ref_chk" CHECK (business_transaction_type IS NULL AND business_transaction_id IS NULL OR status = 'completed'::text AND business_transaction_type IS NOT NULL AND btrim(business_transaction_type) <> ''::text AND octet_length(business_transaction_type) <= 128 AND business_transaction_id IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_chk" CHECK (confirmation_required = false AND confirmation_policy = 'none'::text AND confirmation_token_hash IS NULL AND confirmation_actor_id IS NULL AND confirmation_at IS NULL AND confirmation_expires_at IS NULL OR confirmation_required = true AND confirmation_policy <> 'none'::text AND confirmation_token_hash IS NOT NULL AND confirmation_expires_at IS NOT NULL AND confirmation_expires_at > created_at AND (confirmation_actor_id IS NULL AND confirmation_at IS NULL OR confirmation_actor_id IS NOT NULL AND confirmation_at IS NOT NULL AND confirmation_at >= created_at AND confirmation_at <= confirmation_expires_at) AND ((status <> ALL (ARRAY['confirmed'::text, 'executing'::text, 'completed'::text])) OR confirmation_actor_id IS NOT NULL) AND (status <> 'proposed'::text OR confirmation_actor_id IS NULL));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_hash_chk" CHECK (confirmation_token_hash IS NULL OR confirmation_token_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_policy_chk" CHECK (confirmation_policy = ANY (ARRAY['none'::text, 'explicit'::text, 'step_up'::text, 'dual_control'::text]));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmed_state_chk" CHECK (status <> 'confirmed'::text OR confirmation_required = true AND operation_class <> 'unresolved'::text AND risk_class <> 'unknown'::text AND (autonomy_decision = ANY (ARRAY['suggest'::text, 'assist'::text, 'auto'::text])) AND tool_version IS NOT NULL AND action_code IS NOT NULL AND input_hash IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_duration_state_chk" CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text])) AND duration_ms IS NULL OR (status = ANY (ARRAY['completed'::text, 'denied'::text, 'failed'::text, 'expired'::text, 'cancelled'::text])) AND duration_ms IS NOT NULL AND duration_ms >= 0);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_entity_chk" CHECK (affected_entity_type IS NULL AND affected_entity_id IS NULL OR affected_entity_type IS NOT NULL AND btrim(affected_entity_type) <> ''::text AND octet_length(affected_entity_type) <= 128 AND affected_entity_id IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_evidence_chk" CHECK (jsonb_typeof(evidence_refs) = 'array'::text AND octet_length(evidence_refs::text) <= 65536 AND (status = 'completed'::text OR evidence_refs = '[]'::jsonb));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_executable_chk" CHECK ((status <> ALL (ARRAY['executing'::text, 'completed'::text])) OR operation_class <> 'unresolved'::text AND risk_class <> 'unknown'::text AND (autonomy_decision = ANY (ARRAY['suggest'::text, 'assist'::text, 'auto'::text])) AND tool_version IS NOT NULL AND action_code IS NOT NULL AND input_hash IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_executable_identity_chk" CHECK ((status <> ALL (ARRAY['executing'::text, 'completed'::text])) OR tool_version IS NOT NULL AND action_code IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_execution_guard_chk" CHECK (executing_at IS NULL AND execution_guard_snapshot IS NULL AND execution_auth_epoch IS NULL AND execution_policy_revision IS NULL OR executing_at IS NOT NULL AND execution_guard_snapshot IS NOT NULL AND jsonb_typeof(execution_guard_snapshot) = 'object'::text AND execution_guard_snapshot <> '{}'::jsonb AND octet_length(execution_guard_snapshot::text) <= 32768 AND execution_auth_epoch IS NOT NULL AND execution_auth_epoch >= 0 AND execution_policy_revision IS NOT NULL AND btrim(execution_policy_revision) <> ''::text AND octet_length(execution_policy_revision) <= 256);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_execution_state_chk" CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'denied'::text, 'expired'::text])) AND executing_at IS NULL OR (status = ANY (ARRAY['executing'::text, 'completed'::text])) AND executing_at IS NOT NULL OR (status = ANY (ARRAY['failed'::text, 'cancelled'::text])));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_expected_version_chk" CHECK (expected_record_row_version IS NULL OR expected_record_row_version >= 0 AND affected_entity_id IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_expiry_chk" CHECK (status <> 'expired'::text OR confirmation_required = true AND confirmation_expires_at IS NOT NULL AND terminal_at >= confirmation_expires_at);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_input_hash_chk" CHECK (input_hash IS NULL OR input_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_mutation_execution_chk" CHECK (operation_class <> 'mutate'::text OR confirmation_required = true AND (autonomy_decision = ANY (ARRAY['suggest'::text, 'assist'::text])) AND (executing_at IS NULL OR downstream_command_idempotency_key IS NOT NULL));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_mutation_idempotency_chk" CHECK (downstream_command_idempotency_key IS NULL OR btrim(downstream_command_idempotency_key) <> ''::text AND octet_length(downstream_command_idempotency_key) <= 256 AND executing_at IS NOT NULL);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_operation_class_chk" CHECK (operation_class = ANY (ARRAY['unresolved'::text, 'read'::text, 'propose'::text, 'mutate'::text]));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_outcome_chk" CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text])) AND terminal_at IS NULL AND terminal_error_class IS NULL AND result_hash IS NULL AND business_transaction_id IS NULL AND duration_ms IS NULL OR status = 'completed'::text AND terminal_at IS NOT NULL AND terminal_error_class IS NULL AND result_hash IS NOT NULL AND duration_ms IS NOT NULL AND duration_ms >= 0 OR (status = ANY (ARRAY['denied'::text, 'failed'::text, 'expired'::text, 'cancelled'::text])) AND terminal_at IS NOT NULL AND terminal_error_class IS NOT NULL AND btrim(terminal_error_class) <> ''::text AND octet_length(terminal_error_class) <= 128 AND result_hash IS NULL AND business_transaction_id IS NULL AND duration_ms IS NOT NULL AND duration_ms >= 0);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_permission_snapshot_chk" CHECK (jsonb_typeof(permission_snapshot) = 'object'::text AND permission_snapshot <> '{}'::jsonb AND octet_length(permission_snapshot::text) <= 32768);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'studio'::text]));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_policy_snapshot_chk" CHECK (jsonb_typeof(policy_snapshot) = 'object'::text AND policy_snapshot <> '{}'::jsonb AND octet_length(policy_snapshot::text) <= 32768);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_profile_snapshot_chk" CHECK (jsonb_typeof(profile_snapshot) = 'object'::text AND profile_snapshot <> '{}'::jsonb AND octet_length(profile_snapshot::text) <= 32768);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_result_hash_chk" CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_revision_chk" CHECK (btrim(policy_revision) <> ''::text AND octet_length(policy_revision) <= 256 AND btrim(profile_revision) <> ''::text AND octet_length(profile_revision) <= 256);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_risk_class_chk" CHECK (risk_class = ANY (ARRAY['unknown'::text, 'low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_status_chk" CHECK (status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text, 'completed'::text, 'denied'::text, 'failed'::text, 'expired'::text, 'cancelled'::text]));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_summary_chk" CHECK (btrim(proposal_summary) <> ''::text AND octet_length(proposal_summary) <= 4096);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_time_chk" CHECK ((confirmation_at IS NULL OR confirmation_at >= created_at) AND (executing_at IS NULL OR executing_at >= created_at) AND (executing_at IS NULL OR confirmation_at IS NULL OR executing_at >= confirmation_at) AND (terminal_at IS NULL OR terminal_at >= created_at) AND (terminal_at IS NULL OR executing_at IS NULL OR terminal_at >= executing_at));

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tool_call_id_chk" CHECK (btrim(tool_call_id) <> ''::text AND octet_length(tool_call_id) <= 256);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tool_code_chk" CHECK (tool_code ~ '^[A-Za-z0-9_-]{1,128}$'::text);

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tool_version_chk" CHECK (tool_version IS NULL OR tool_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'::text);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_cancel_request_chk" CHECK (cancellation_requested_at IS NULL AND cancellation_requested_by IS NULL OR cancellation_requested_at IS NOT NULL AND cancellation_requested_by = principal_id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_error_chk" CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text])) AND terminal_error_class IS NULL OR (status = ANY (ARRAY['failed'::text, 'cancelled'::text])) AND terminal_error_class IS NOT NULL AND btrim(terminal_error_class) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_messages_distinct_chk" CHECK (input_message_id <> output_message_id);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'studio'::text]));

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_status_chk" CHECK (status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_terminal_chk" CHECK (status = 'started'::text AND terminal_at IS NULL OR (status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])) AND terminal_at IS NOT NULL);

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_time_chk" CHECK (created_at >= started_at AND (terminal_at IS NULL OR terminal_at >= started_at) AND (cancellation_requested_at IS NULL OR cancellation_requested_at >= started_at));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_calibration_log"
  ADD CONSTRAINT "ai_calibration_log_acl_pkey" PRIMARY KEY (id);

ALTER TABLE "ai"."ai_call_transcript"
  ADD CONSTRAINT "ai_call_transcript_act_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "ai"."ai_feedback_log"
  ADD CONSTRAINT "ai_feedback_log_afl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_inference_log"
  ADD CONSTRAINT "ai_inference_log_ail_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_monitoring_log"
  ADD CONSTRAINT "ai_monitoring_log_aml_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_run_sequence_uq" UNIQUE (tenant_id, run_id, sequence_no);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_billable_chk" CHECK (billable_units IS NULL OR billable_units >= 0::numeric);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_billable_pair_chk" CHECK ((billable_units IS NULL) = (billable_unit_type IS NULL));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_completed_usage_chk" CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text OR (usage_source = 'unavailable'::text AND model_call_count = 0 AND tool_call_count > 0 AND resolved_provider_id IS NULL AND actual_model_id IS NULL));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_cost_chk" CHECK (cost_amount IS NULL OR cost_amount >= 0::numeric);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_cost_coherence_chk" CHECK (cost_amount IS NULL AND cost_basis IS NULL AND price_version IS NULL OR cost_amount IS NOT NULL AND (cost_basis = ANY (ARRAY['catalog_estimate'::text, 'provider_reported'::text, 'billing_reconciled'::text])) AND (cost_basis <> 'catalog_estimate'::text OR price_version IS NOT NULL));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_credential_coherence_chk" CHECK (num_nonnulls(credential_owner, credential_source, credential_reference_hash, credential_fingerprint) = ANY (ARRAY[0, 4]));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_currency_chk" CHECK (cost_currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_duration_chk" CHECK (duration_ms >= 0);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_kind_chk" CHECK (call_kind = ANY (ARRAY['model'::text, 'tool'::text, 'retrieval'::text]));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_operation_chk" CHECK (operation_id IS NULL OR btrim(operation_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_outcome_chk" CHECK (outcome = ANY (ARRAY['completed'::text, 'failed'::text, 'incomplete'::text, 'cancelled'::text]));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_owner_chk" CHECK (credential_owner IS NULL OR (credential_owner = ANY (ARRAY['platform'::text, 'tenant'::text, 'developer'::text])));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_provider_account_class_chk" CHECK (provider_account_class IS NULL OR (provider_account_class = ANY (ARRAY['platform_unverified'::text, 'platform_paid'::text, 'developer_free'::text, 'tenant_paid'::text, 'tenant_byok'::text, 'local'::text, 'test'::text])));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_retry_chk" CHECK (retry_count >= 0);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_sequence_chk" CHECK (sequence_no >= 0);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_source_chk" CHECK (credential_source IS NULL OR (credential_source = ANY (ARRAY['environment'::text, 'platform_vault'::text, 'tenant_vault'::text, 'developer_local'::text])));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_time_chk" CHECK (completed_at >= started_at AND (first_token_at IS NULL OR first_token_at >= started_at AND first_token_at <= completed_at));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_tokens_chk" CHECK ((input_tokens IS NULL OR input_tokens >= 0) AND (cache_read_tokens IS NULL OR cache_read_tokens >= 0) AND (cache_write_tokens IS NULL OR cache_write_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0) AND (reasoning_tokens IS NULL OR reasoning_tokens >= 0));

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_usage_coherence_chk" CHECK (usage_source = 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) = 0 OR usage_source <> 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) > 0);

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_usage_source_chk" CHECK (usage_source = ANY (ARRAY['provider_final'::text, 'provider_stream'::text, 'estimated'::text, 'unavailable'::text]));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_actual_model_chk" CHECK (actual_model_id IS NULL OR btrim(actual_model_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_billable_chk" CHECK (billable_units IS NULL OR billable_units >= 0::numeric);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_billable_pair_chk" CHECK ((billable_units IS NULL) = (billable_unit_type IS NULL));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_binding_chk" CHECK (resolved_binding_id IS NULL OR btrim(resolved_binding_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_completed_usage_chk" CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text OR (usage_source = 'unavailable'::text AND model_call_count = 0 AND tool_call_count > 0 AND resolved_provider_id IS NULL AND actual_model_id IS NULL));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_cost_chk" CHECK (cost_amount IS NULL OR cost_amount >= 0::numeric);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_cost_coherence_chk" CHECK (cost_amount IS NULL AND cost_basis IS NULL AND price_version IS NULL OR cost_amount IS NOT NULL AND (cost_basis = ANY (ARRAY['catalog_estimate'::text, 'provider_reported'::text, 'billing_reconciled'::text])) AND (cost_basis <> 'catalog_estimate'::text OR price_version IS NOT NULL));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_counts_chk" CHECK (model_call_count >= 0 AND tool_call_count >= 0 AND retrieval_call_count >= 0 AND retry_count >= 0);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_currency_chk" CHECK (cost_currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_duration_chk" CHECK (duration_ms >= 0);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_model_chk" CHECK (btrim(requested_model_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_outcome_chk" CHECK (outcome = ANY (ARRAY['completed'::text, 'failed'::text, 'incomplete'::text, 'cancelled'::text, 'rejected'::text]));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'studio'::text]));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_provider_account_class_chk" CHECK (provider_account_class IS NULL OR (provider_account_class = ANY (ARRAY['platform_unverified'::text, 'platform_paid'::text, 'developer_free'::text, 'tenant_paid'::text, 'tenant_byok'::text, 'local'::text, 'test'::text])));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_provider_chk" CHECK (resolved_provider_id IS NULL OR btrim(resolved_provider_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_time_chk" CHECK (completed_at >= started_at AND (first_token_at IS NULL OR first_token_at >= started_at AND first_token_at <= completed_at));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_tokens_chk" CHECK ((input_tokens IS NULL OR input_tokens >= 0) AND (cache_read_tokens IS NULL OR cache_read_tokens >= 0) AND (cache_write_tokens IS NULL OR cache_write_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0) AND (reasoning_tokens IS NULL OR reasoning_tokens >= 0));

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_usage_coherence_chk" CHECK (usage_source = 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) = 0 OR usage_source <> 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) > 0);

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_usage_source_chk" CHECK (usage_source = ANY (ARRAY['provider_final'::text, 'provider_stream'::text, 'estimated'::text, 'unavailable'::text]));

ALTER TABLE "ai"."ai_call_transcript"
  ADD CONSTRAINT "ai_call_transcript_act_conf_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE "ai"."ai_call_transcript"
  ADD CONSTRAINT "ai_call_transcript_act_dur_chk" CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE "ai"."ai_call_transcript"
  ADD CONSTRAINT "ai_call_transcript_act_sess_chk" CHECK (btrim(session_id) <> ''::text);

ALTER TABLE ONLY "ai"."ai_inference_log"
  ADD CONSTRAINT "ai_inference_log_ail_conf_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "ai"."ai_inference_log"
  ADD CONSTRAINT "ai_inference_log_ail_inf_chk" CHECK (inference_type = ANY (ARRAY['action'::text, 'prediction'::text]));

ALTER TABLE ONLY "ai"."ai_monitoring_log"
  ADD CONSTRAINT "ai_monitoring_log_aml_metric_chk" CHECK (btrim(metric_name) <> ''::text);

ALTER TABLE ONLY "ai"."ai_monitoring_log"
  ADD CONSTRAINT "ai_monitoring_log_aml_mon_chk" CHECK (monitor_type = ANY (ARRAY['drift'::text, 'anomaly_baseline'::text]));

ALTER TABLE ONLY "ai"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_pkey" PRIMARY KEY (conversation_id);

ALTER TABLE ONLY "ai"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_ordinal_uq" UNIQUE (tenant_id, revision_id, ordinal);

ALTER TABLE ONLY "ai"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_source_version_uq" UNIQUE (tenant_id, source_id, source_version_id);

ALTER TABLE ONLY "ai"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_tenant_uq" UNIQUE (tenant_id, source_kind, source_id);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_scope_id_uq" UNIQUE (tenant_id, conversation_id, plane, id);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_sequence_uq" UNIQUE (tenant_id, conversation_id, sequence);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_scope_uq" UNIQUE (tenant_id, conversation_id, plane);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_tenant_conversation_uq" UNIQUE (tenant_id, conversation_id);

ALTER TABLE ONLY "ai"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_checksum_chk" CHECK (btrim(checksum) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_range_chk" CHECK (character_start >= 0 AND character_end > character_start);

ALTER TABLE ONLY "ai"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_status_chk" CHECK (index_status = ANY (ARRAY['pending'::text, 'indexing'::text, 'ready'::text, 'failed'::text, 'deleted'::text]));

ALTER TABLE ONLY "ai"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_checksum_chk" CHECK (btrim(checksum) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'indexing'::text, 'ready'::text, 'failed'::text, 'superseded'::text, 'deleted'::text]));

ALTER TABLE ONLY "ai"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_version_chk" CHECK (btrim(source_version_id) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_id_chk" CHECK (btrim(source_id) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_kind_chk" CHECK (source_kind = ANY (ARRAY['record'::text, 'attachment'::text, 'content'::text]));

ALTER TABLE ONLY "ai"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_permission_chk" CHECK (btrim(permission_code) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_knowledge_source"
  ADD CONSTRAINT "atlas_knowledge_source_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'deleted'::text]));

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_citation_refs_chk" CHECK (jsonb_typeof(citation_refs) = 'array'::text);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_content_blocks_chk" CHECK (jsonb_typeof(content_blocks) = 'array'::text);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_content_ref_chk" CHECK (protected_content_ref IS NULL OR btrim(protected_content_ref) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_content_storage_chk" CHECK (protected_content_ref IS NULL OR content_blocks = '[]'::jsonb);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_error_chk" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])) AND terminal_error_class IS NULL OR (status = ANY (ARRAY['failed'::text, 'cancelled'::text])) AND terminal_error_class IS NOT NULL AND btrim(terminal_error_class) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_parent_chk" CHECK (parent_message_id IS NULL OR parent_message_id <> id);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'studio'::text]));

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_result_cards_chk" CHECK (jsonb_typeof(result_cards) = 'array'::text);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_role_chk" CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text, 'system'::text]));

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_sequence_chk" CHECK (sequence > 0);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_terminal_chk" CHECK (status = 'pending'::text AND terminal_at IS NULL OR (status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])) AND terminal_at IS NOT NULL);

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_tool_refs_chk" CHECK (jsonb_typeof(tool_refs) = 'array'::text);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_expiry_chk" CHECK (expires_at IS NULL OR expires_at > created_at);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_legal_hold_chk" CHECK (legal_hold = false AND legal_hold_reference IS NULL OR legal_hold = true AND legal_hold_reference IS NOT NULL AND btrim(legal_hold_reference) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'studio'::text]));

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_purge_chk" CHECK (purge_after IS NULL OR purge_after > created_at);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_retention_policy_chk" CHECK (retention_policy_id IS NULL OR btrim(retention_policy_id) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_row_version_chk" CHECK (row_version >= 1);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_sequence_chk" CHECK (last_message_sequence >= 0);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_blocks_chk" CHECK (summary_blocks IS NULL OR jsonb_typeof(summary_blocks) = 'array'::text);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_ref_chk" CHECK (protected_summary_ref IS NULL OR btrim(protected_summary_ref) <> ''::text);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_storage_chk" CHECK (summary_blocks IS NULL OR protected_summary_ref IS NULL);

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_summary_version_chk" CHECK (summary_version >= 0);

ALTER TABLE ONLY ai.atlas_knowledge_source
  ADD CONSTRAINT atlas_knowledge_source_tenant_id_uq UNIQUE (tenant_id, id);

ALTER TABLE ONLY ai.atlas_knowledge_revision
  ADD CONSTRAINT atlas_knowledge_revision_tenant_id_uq UNIQUE (tenant_id, id);

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_override_policy_fk" FOREIGN KEY (override_policy_definition_id) REFERENCES control.policy_definition(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_action_policy"
  ADD CONSTRAINT "ai_action_policy_aap_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_confidence_threshold"
  ADD CONSTRAINT "ai_confidence_threshold_act_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_superseded_by_fk" FOREIGN KEY (superseded_by_id) REFERENCES ai.ai_drift_baseline(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_drift_baseline"
  ADD CONSTRAINT "ai_drift_baseline_adb_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential"
  ADD CONSTRAINT "atlas_tenant_provider_credential_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_tenant_provider_credential_epoch"
  ADD CONSTRAINT "atlas_tenant_provider_credential_epoch_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_actor_fk" FOREIGN KEY (tenant_id, confirmation_actor_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_run_fk" FOREIGN KEY (tenant_id, thread_id, plane, run_id) REFERENCES ai.atlas_run(tenant_id, conversation_id, plane, id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_thread_fk" FOREIGN KEY (tenant_id, thread_id, plane) REFERENCES ai.atlas_thread(tenant_id, conversation_id, plane) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_cancelled_by_fk" FOREIGN KEY (tenant_id, cancellation_requested_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_input_message_fk" FOREIGN KEY (tenant_id, conversation_id, plane, input_message_id) REFERENCES ai.atlas_message(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_metering_fk" FOREIGN KEY (tenant_id, metering_run_id) REFERENCES ai.ai_agent_run(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_output_message_fk" FOREIGN KEY (tenant_id, conversation_id, plane, output_message_id) REFERENCES ai.atlas_message(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_thread_fk" FOREIGN KEY (tenant_id, conversation_id, plane) REFERENCES ai.atlas_thread(tenant_id, conversation_id, plane) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_run"
  ADD CONSTRAINT "atlas_run_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_run_fk" FOREIGN KEY (tenant_id, run_id) REFERENCES ai.ai_agent_run(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_agent_call"
  ADD CONSTRAINT "ai_agent_call_aac_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_agent_run"
  ADD CONSTRAINT "ai_agent_run_aar_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_calibration_log"
  ADD CONSTRAINT "ai_calibration_log_acl_calibrated_by_fk" FOREIGN KEY (calibrated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_calibration_log"
  ADD CONSTRAINT "ai_calibration_log_acl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE "ai"."ai_call_transcript"
  ADD CONSTRAINT "ai_call_transcript_act_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE "ai"."ai_call_transcript"
  ADD CONSTRAINT "ai_call_transcript_act_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_feedback_log"
  ADD CONSTRAINT "ai_feedback_log_afl_submitted_by_fk" FOREIGN KEY (submitted_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."ai_feedback_log"
  ADD CONSTRAINT "ai_feedback_log_afl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_inference_log"
  ADD CONSTRAINT "ai_inference_log_ail_accepted_by_fk" FOREIGN KEY (accepted_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_inference_log"
  ADD CONSTRAINT "ai_inference_log_ail_reversed_by_fk" FOREIGN KEY (reversed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "ai"."ai_inference_log"
  ADD CONSTRAINT "ai_inference_log_ail_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."ai_monitoring_log"
  ADD CONSTRAINT "ai_monitoring_log_aml_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_knowledge_chunk"
  ADD CONSTRAINT "atlas_knowledge_chunk_revision_fk" FOREIGN KEY (tenant_id, revision_id) REFERENCES ai.atlas_knowledge_revision(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_knowledge_revision"
  ADD CONSTRAINT "atlas_knowledge_revision_source_fk" FOREIGN KEY (tenant_id, source_id) REFERENCES ai.atlas_knowledge_source(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_parent_fk" FOREIGN KEY (tenant_id, conversation_id, plane, parent_message_id) REFERENCES ai.atlas_message(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_run_fk" FOREIGN KEY (tenant_id, conversation_id, plane, run_id) REFERENCES ai.atlas_run(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_thread_fk" FOREIGN KEY (tenant_id, conversation_id, plane) REFERENCES ai.atlas_thread(tenant_id, conversation_id, plane) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_message"
  ADD CONSTRAINT "atlas_message_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_conversation_fk" FOREIGN KEY (tenant_id, conversation_id) REFERENCES document.conversation(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_owner_fk" FOREIGN KEY (tenant_id, owner_principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_thread"
  ADD CONSTRAINT "atlas_thread_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_tenant_quota_policy"
  ADD CONSTRAINT "atlas_tenant_quota_policy_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_policy"
  ADD CONSTRAINT "atlas_tenant_quota_policy_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_policy"
  ADD CONSTRAINT "atlas_tenant_quota_policy_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_window"
  ADD CONSTRAINT "atlas_tenant_quota_window_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_window"
  ADD CONSTRAINT "atlas_tenant_quota_window_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_window"
  ADD CONSTRAINT "atlas_tenant_quota_window_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_window_fk" FOREIGN KEY (tenant_id, window_started_at) REFERENCES ai.atlas_tenant_quota_window(tenant_id, window_started_at) ON DELETE CASCADE;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "ai"."atlas_provider_usage"
  ADD CONSTRAINT "atlas_provider_usage_pkey" PRIMARY KEY (provider_call_id);

ALTER TABLE ONLY "ai"."atlas_provider_usage"
  ADD CONSTRAINT "atlas_provider_usage_provider_id_check" CHECK (provider_id IN ('openai', 'anthropic', 'gemini', 'ollama'));

ALTER TABLE ONLY "ai"."atlas_provider_usage"
  ADD CONSTRAINT "atlas_provider_usage_entry_check" CHECK (jsonb_typeof(entry) = 'object');

ALTER TABLE ONLY "ai"."atlas_provider_usage"
  ADD CONSTRAINT "atlas_provider_usage_tenant_id_run_id_fkey" FOREIGN KEY (tenant_id, run_id) REFERENCES ai.atlas_run(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "ai"."atlas_tenant_quota_reservation"
  ADD CONSTRAINT "atlas_tenant_quota_reservation_usage_source_check" CHECK (usage_source IN ('provider_final', 'estimated'));
