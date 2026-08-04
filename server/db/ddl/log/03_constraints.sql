-- ============================================================================
-- log/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "log"."activity_log"
  ADD CONSTRAINT "al_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."activity_log_default"
  ADD CONSTRAINT "activity_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."ai_calibration_log"
  ADD CONSTRAINT "acl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."ai_call_transcript"
  ADD CONSTRAINT "act_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."ai_call_transcript_default"
  ADD CONSTRAINT "ai_call_transcript_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."ai_feedback_log"
  ADD CONSTRAINT "afl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."ai_inference_log"
  ADD CONSTRAINT "ail_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."ai_monitoring_log"
  ADD CONSTRAINT "aml_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."atlas_byok_audit"
  ADD CONSTRAINT "atlas_byok_audit_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."attachment_access_log"
  ADD CONSTRAINT "aal_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."attachment_access_log_default"
  ADD CONSTRAINT "attachment_access_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."audit_dlq"
  ADD CONSTRAINT "audit_dlq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_pkey" PRIMARY KEY (id, observed_at);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_default_pkey" PRIMARY KEY (id, observed_at);

ALTER TABLE ONLY "log"."close_activity_log"
  ADD CONSTRAINT "cal_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."close_override_log"
  ADD CONSTRAINT "col_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."comment_retention_log"
  ADD CONSTRAINT "crl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."cycle_audit_log"
  ADD CONSTRAINT "cycle_audit_log_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."cycle_audit_log_default"
  ADD CONSTRAINT "cycle_audit_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."descriptor_cache_invalidation"
  ADD CONSTRAINT "dci_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."descriptor_cache_invalidation_default"
  ADD CONSTRAINT "descriptor_cache_invalidation_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."dimension_resolution_log"
  ADD CONSTRAINT "drl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."entity_lifecycle_log"
  ADD CONSTRAINT "ell_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."export_log"
  ADD CONSTRAINT "el_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."field_access_log"
  ADD CONSTRAINT "fal_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."field_access_log_default"
  ADD CONSTRAINT "field_access_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."hash_anchor"
  ADD CONSTRAINT "ha_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."job_log"
  ADD CONSTRAINT "jl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."kpi_execution_log"
  ADD CONSTRAINT "kel_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."notification_dlq"
  ADD CONSTRAINT "notification_dlq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."parameter_change_log"
  ADD CONSTRAINT "parameter_change_log_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."password_history"
  ADD CONSTRAINT "ph_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "permission_decision_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."platform_audit_log"
  ADD CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."policy_evaluation_log"
  ADD CONSTRAINT "pel_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."resolution_log"
  ADD CONSTRAINT "rl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."search_history"
  ADD CONSTRAINT "sh_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."search_history_default"
  ADD CONSTRAINT "search_history_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."security_event_log"
  ADD CONSTRAINT "sel_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."security_event_log_default"
  ADD CONSTRAINT "security_event_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "workflow_event_log_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "log"."workspace_usage_metric"
  ADD CONSTRAINT "wum_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_run_sequence_uq" UNIQUE (tenant_id, run_id, sequence_no);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "log"."hash_anchor"
  ADD CONSTRAINT "ha_date_uq" UNIQUE (tenant_id, anchor_date);

ALTER TABLE ONLY "log"."activity_log"
  ADD CONSTRAINT "al_act_chk" CHECK (btrim(activity_type) <> ''::text);

ALTER TABLE ONLY "log"."activity_log"
  ADD CONSTRAINT "al_dom_chk" CHECK (btrim(domain) <> ''::text);

ALTER TABLE ONLY "log"."activity_log_default"
  ADD CONSTRAINT "al_act_chk" CHECK (btrim(activity_type) <> ''::text);

ALTER TABLE ONLY "log"."activity_log_default"
  ADD CONSTRAINT "al_dom_chk" CHECK (btrim(domain) <> ''::text);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_billable_chk" CHECK (billable_units IS NULL OR billable_units >= 0::numeric);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_billable_pair_chk" CHECK ((billable_units IS NULL) = (billable_unit_type IS NULL));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_completed_usage_chk" CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_cost_chk" CHECK (cost_amount IS NULL OR cost_amount >= 0::numeric);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_cost_coherence_chk" CHECK (cost_amount IS NULL AND cost_basis IS NULL AND price_version IS NULL OR cost_amount IS NOT NULL AND (cost_basis = ANY (ARRAY['catalog_estimate'::text, 'provider_reported'::text, 'billing_reconciled'::text])) AND (cost_basis <> 'catalog_estimate'::text OR price_version IS NOT NULL));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_credential_coherence_chk" CHECK (num_nonnulls(credential_owner, credential_source, credential_reference_hash, credential_fingerprint) = ANY (ARRAY[0, 4]));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_currency_chk" CHECK (cost_currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_duration_chk" CHECK (duration_ms >= 0);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_kind_chk" CHECK (call_kind = ANY (ARRAY['model'::text, 'tool'::text, 'retrieval'::text]));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_operation_chk" CHECK (operation_id IS NULL OR btrim(operation_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_outcome_chk" CHECK (outcome = ANY (ARRAY['completed'::text, 'failed'::text, 'incomplete'::text, 'cancelled'::text]));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_owner_chk" CHECK (credential_owner IS NULL OR (credential_owner = ANY (ARRAY['platform'::text, 'tenant'::text, 'developer'::text])));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_provider_account_class_chk" CHECK (provider_account_class IS NULL OR (provider_account_class = ANY (ARRAY['platform_unverified'::text, 'platform_paid'::text, 'developer_free'::text, 'tenant_paid'::text, 'tenant_byok'::text, 'local'::text, 'test'::text])));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_retry_chk" CHECK (retry_count >= 0);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_sequence_chk" CHECK (sequence_no >= 0);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_source_chk" CHECK (credential_source IS NULL OR (credential_source = ANY (ARRAY['environment'::text, 'platform_vault'::text, 'tenant_vault'::text, 'developer_local'::text])));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_time_chk" CHECK (completed_at >= started_at AND (first_token_at IS NULL OR first_token_at >= started_at AND first_token_at <= completed_at));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_tokens_chk" CHECK ((input_tokens IS NULL OR input_tokens >= 0) AND (cache_read_tokens IS NULL OR cache_read_tokens >= 0) AND (cache_write_tokens IS NULL OR cache_write_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0) AND (reasoning_tokens IS NULL OR reasoning_tokens >= 0));

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_usage_coherence_chk" CHECK (usage_source = 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) = 0 OR usage_source <> 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) > 0);

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_usage_source_chk" CHECK (usage_source = ANY (ARRAY['provider_final'::text, 'provider_stream'::text, 'estimated'::text, 'unavailable'::text]));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_actual_model_chk" CHECK (actual_model_id IS NULL OR btrim(actual_model_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_billable_chk" CHECK (billable_units IS NULL OR billable_units >= 0::numeric);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_billable_pair_chk" CHECK ((billable_units IS NULL) = (billable_unit_type IS NULL));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_binding_chk" CHECK (resolved_binding_id IS NULL OR btrim(resolved_binding_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_completed_usage_chk" CHECK (outcome <> 'completed'::text OR usage_source = 'provider_final'::text);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_cost_chk" CHECK (cost_amount IS NULL OR cost_amount >= 0::numeric);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_cost_coherence_chk" CHECK (cost_amount IS NULL AND cost_basis IS NULL AND price_version IS NULL OR cost_amount IS NOT NULL AND (cost_basis = ANY (ARRAY['catalog_estimate'::text, 'provider_reported'::text, 'billing_reconciled'::text])) AND (cost_basis <> 'catalog_estimate'::text OR price_version IS NOT NULL));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_counts_chk" CHECK (model_call_count >= 0 AND tool_call_count >= 0 AND retrieval_call_count >= 0 AND retry_count >= 0);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_currency_chk" CHECK (cost_currency ~ '^[A-Z]{3}$'::text);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_duration_chk" CHECK (duration_ms >= 0);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_model_chk" CHECK (btrim(requested_model_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_outcome_chk" CHECK (outcome = ANY (ARRAY['completed'::text, 'failed'::text, 'incomplete'::text, 'cancelled'::text, 'rejected'::text]));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_provider_account_class_chk" CHECK (provider_account_class IS NULL OR (provider_account_class = ANY (ARRAY['platform_unverified'::text, 'platform_paid'::text, 'developer_free'::text, 'tenant_paid'::text, 'tenant_byok'::text, 'local'::text, 'test'::text])));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_provider_chk" CHECK (resolved_provider_id IS NULL OR btrim(resolved_provider_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_time_chk" CHECK (completed_at >= started_at AND (first_token_at IS NULL OR first_token_at >= started_at AND first_token_at <= completed_at));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_tokens_chk" CHECK ((input_tokens IS NULL OR input_tokens >= 0) AND (cache_read_tokens IS NULL OR cache_read_tokens >= 0) AND (cache_write_tokens IS NULL OR cache_write_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0) AND (reasoning_tokens IS NULL OR reasoning_tokens >= 0));

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_usage_coherence_chk" CHECK (usage_source = 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) = 0 OR usage_source <> 'unavailable'::text AND num_nonnulls(input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens) > 0);

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_usage_source_chk" CHECK (usage_source = ANY (ARRAY['provider_final'::text, 'provider_stream'::text, 'estimated'::text, 'unavailable'::text]));

ALTER TABLE ONLY "log"."ai_call_transcript"
  ADD CONSTRAINT "act_conf_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "log"."ai_call_transcript"
  ADD CONSTRAINT "act_dur_chk" CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE ONLY "log"."ai_call_transcript"
  ADD CONSTRAINT "act_sess_chk" CHECK (btrim(session_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_call_transcript_default"
  ADD CONSTRAINT "act_conf_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "log"."ai_call_transcript_default"
  ADD CONSTRAINT "act_dur_chk" CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE ONLY "log"."ai_call_transcript_default"
  ADD CONSTRAINT "act_sess_chk" CHECK (btrim(session_id) <> ''::text);

ALTER TABLE ONLY "log"."ai_inference_log"
  ADD CONSTRAINT "ail_conf_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "log"."ai_inference_log"
  ADD CONSTRAINT "ail_inf_chk" CHECK (inference_type = ANY (ARRAY['action'::text, 'prediction'::text]));

ALTER TABLE ONLY "log"."ai_monitoring_log"
  ADD CONSTRAINT "aml_metric_chk" CHECK (btrim(metric_name) <> ''::text);

ALTER TABLE ONLY "log"."ai_monitoring_log"
  ADD CONSTRAINT "aml_mon_chk" CHECK (monitor_type = ANY (ARRAY['drift'::text, 'anomaly_baseline'::text]));

ALTER TABLE ONLY "log"."atlas_byok_audit"
  ADD CONSTRAINT "atlas_byok_audit_event_chk" CHECK (event = ANY (ARRAY['created'::text, 'resolved'::text, 'unavailable'::text, 'rotated'::text, 'revoked'::text, 'reencrypted'::text, 'cache_evicted'::text, 'recovery_verified'::text]));

ALTER TABLE ONLY "log"."atlas_byok_audit"
  ADD CONSTRAINT "atlas_byok_audit_no_secret_chk" CHECK (reference_fingerprint IS NULL OR reference_fingerprint ~ '^(ref|credential):hmac-sha256:v[0-9]+:[0-9a-f]{32}$'::text);

ALTER TABLE ONLY "log"."attachment_access_log"
  ADD CONSTRAINT "aal_outcome_chk" CHECK (outcome = ANY (ARRAY['success'::text, 'denied'::text, 'not_found'::text, 'error'::text, 'watermarked'::text]));

ALTER TABLE ONLY "log"."attachment_access_log_default"
  ADD CONSTRAINT "aal_outcome_chk" CHECK (outcome = ANY (ARRAY['success'::text, 'denied'::text, 'not_found'::text, 'error'::text, 'watermarked'::text]));

ALTER TABLE ONLY "log"."audit_dlq"
  ADD CONSTRAINT "audit_dlq_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_op_chk" CHECK (operation = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text, 'status_change'::text, 'bulk_insert'::text, 'bulk_update'::text, 'bulk_delete'::text, 'restore'::text, 'archive'::text, 'purge'::text]));

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_op_chk" CHECK (operation = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text, 'status_change'::text, 'bulk_insert'::text, 'bulk_update'::text, 'bulk_delete'::text, 'restore'::text, 'archive'::text, 'purge'::text]));

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_compilation_chk" CHECK (btrim(entitlement_version) <> ''::text AND catalog_sha256 ~ '^[0-9a-f]{64}$'::text AND role_compilation_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_decision_chk" CHECK (decision = ANY (ARRAY['allow'::text, 'deny'::text]));

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_duration_chk" CHECK (evaluation_microseconds IS NULL OR evaluation_microseconds >= 0);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_epoch_chk" CHECK (global_epoch >= 0 AND tenant_epoch >= 0 AND plane_epoch >= 0);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_evaluator_chk" CHECK (btrim(evaluator_contract_version) <> ''::text AND btrim(evaluator_revision) <> ''::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_evidence_chk" CHECK (jsonb_typeof(evidence_ids) = 'object'::text AND evidence_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_external_hash_chk" CHECK (external_identity_sha256 IS NULL OR external_identity_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_ids_chk" CHECK (array_position(matched_plane_membership_ids, NULL::uuid) IS NULL AND array_position(matched_group_membership_ids, NULL::uuid) IS NULL AND array_position(matched_group_assignment_ids, NULL::uuid) IS NULL AND array_position(matched_role_ids, NULL::uuid) IS NULL AND array_position(matched_compiled_permission_ids, NULL::uuid) IS NULL AND array_position(matched_scope_ids, NULL::uuid) IS NULL AND array_position(matched_deny_ids, NULL::uuid) IS NULL AND array_position(matched_override_ids, NULL::uuid) IS NULL AND array_position(matched_record_acl_ids, NULL::uuid) IS NULL AND array_position(matched_delegation_ids, NULL::uuid) IS NULL);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_reason_chk" CHECK (reason_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_request_chk" CHECK (request_id IS NULL OR length(request_id) <= 256);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2"
  ADD CONSTRAINT "auth_decision_evidence_v2_resource_chk" CHECK (resource_type IS NULL AND resource_key_sha256 IS NULL OR resource_type ~ '^[a-z][a-z0-9_.-]{1,127}$'::text AND resource_key_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_compilation_chk" CHECK (btrim(entitlement_version) <> ''::text AND catalog_sha256 ~ '^[0-9a-f]{64}$'::text AND role_compilation_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_decision_chk" CHECK (decision = ANY (ARRAY['allow'::text, 'deny'::text]));

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_duration_chk" CHECK (evaluation_microseconds IS NULL OR evaluation_microseconds >= 0);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_epoch_chk" CHECK (global_epoch >= 0 AND tenant_epoch >= 0 AND plane_epoch >= 0);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_evaluator_chk" CHECK (btrim(evaluator_contract_version) <> ''::text AND btrim(evaluator_revision) <> ''::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_evidence_chk" CHECK (jsonb_typeof(evidence_ids) = 'object'::text AND evidence_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_external_hash_chk" CHECK (external_identity_sha256 IS NULL OR external_identity_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_ids_chk" CHECK (array_position(matched_plane_membership_ids, NULL::uuid) IS NULL AND array_position(matched_group_membership_ids, NULL::uuid) IS NULL AND array_position(matched_group_assignment_ids, NULL::uuid) IS NULL AND array_position(matched_role_ids, NULL::uuid) IS NULL AND array_position(matched_compiled_permission_ids, NULL::uuid) IS NULL AND array_position(matched_scope_ids, NULL::uuid) IS NULL AND array_position(matched_deny_ids, NULL::uuid) IS NULL AND array_position(matched_override_ids, NULL::uuid) IS NULL AND array_position(matched_record_acl_ids, NULL::uuid) IS NULL AND array_position(matched_delegation_ids, NULL::uuid) IS NULL);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_reason_chk" CHECK (reason_code ~ '^[a-z][a-z0-9_.-]{1,127}$'::text);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_request_chk" CHECK (request_id IS NULL OR length(request_id) <= 256);

ALTER TABLE ONLY "log"."auth_decision_evidence_v2_default"
  ADD CONSTRAINT "auth_decision_evidence_v2_resource_chk" CHECK (resource_type IS NULL AND resource_key_sha256 IS NULL OR resource_type ~ '^[a-z][a-z0-9_.-]{1,127}$'::text AND resource_key_sha256 ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."close_override_log"
  ADD CONSTRAINT "col_activity_chk" CHECK (activity_type = ANY (ARRAY['close_override'::text, 'book_close_audit'::text]));

ALTER TABLE ONLY "log"."comment_retention_log"
  ADD CONSTRAINT "crl_action_chk" CHECK (action = ANY (ARRAY['retained'::text, 'deleted'::text, 'archived'::text, 'flagged'::text]));

ALTER TABLE ONLY "log"."comment_retention_log"
  ADD CONSTRAINT "crl_type_chk" CHECK (btrim(comment_type) <> ''::text);

ALTER TABLE ONLY "log"."cycle_audit_log"
  ADD CONSTRAINT "cal_actor_chk" CHECK (actor_type::text = ANY (ARRAY['USER'::character varying, 'SYSTEM'::character varying, 'SCHEDULER'::character varying]::text[]));

ALTER TABLE ONLY "log"."cycle_audit_log"
  ADD CONSTRAINT "cal_domain_chk" CHECK (domain::text = ANY (ARRAY['RUN'::character varying, 'TASK'::character varying, 'DEVIATION'::character varying, 'CERTIFICATION'::character varying, 'CROSS_DEP'::character varying]::text[]));

ALTER TABLE ONLY "log"."cycle_audit_log_default"
  ADD CONSTRAINT "cal_actor_chk" CHECK (actor_type::text = ANY (ARRAY['USER'::character varying, 'SYSTEM'::character varying, 'SCHEDULER'::character varying]::text[]));

ALTER TABLE ONLY "log"."cycle_audit_log_default"
  ADD CONSTRAINT "cal_domain_chk" CHECK (domain::text = ANY (ARRAY['RUN'::character varying, 'TASK'::character varying, 'DEVIATION'::character varying, 'CERTIFICATION'::character varying, 'CROSS_DEP'::character varying]::text[]));

ALTER TABLE ONLY "log"."descriptor_cache_invalidation"
  ADD CONSTRAINT "dci_plane_chk" CHECK (plane_key IS NULL OR (plane_key = ANY (ARRAY['neon'::text, 'admin'::text, 'mesh'::text])));

ALTER TABLE ONLY "log"."descriptor_cache_invalidation"
  ADD CONSTRAINT "dci_reason_chk" CHECK (reason = ANY (ARRAY['satellite_write'::text, 'version_publish'::text, 'persona_change'::text, 'grant_change'::text, 'plan_change'::text, 'binding_revoke'::text, 'emergency_override'::text, 'manual'::text]));

ALTER TABLE ONLY "log"."descriptor_cache_invalidation_default"
  ADD CONSTRAINT "dci_plane_chk" CHECK (plane_key IS NULL OR (plane_key = ANY (ARRAY['neon'::text, 'admin'::text, 'mesh'::text])));

ALTER TABLE ONLY "log"."descriptor_cache_invalidation_default"
  ADD CONSTRAINT "dci_reason_chk" CHECK (reason = ANY (ARRAY['satellite_write'::text, 'version_publish'::text, 'persona_change'::text, 'grant_change'::text, 'plan_change'::text, 'binding_revoke'::text, 'emergency_override'::text, 'manual'::text]));

ALTER TABLE ONLY "log"."entity_lifecycle_log"
  ADD CONSTRAINT "ell_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."entity_lifecycle_log"
  ADD CONSTRAINT "ell_status_chk" CHECK (btrim(to_status) <> ''::text);

ALTER TABLE ONLY "log"."field_access_log"
  ADD CONSTRAINT "fal_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."field_access_log"
  ADD CONSTRAINT "fal_field_chk" CHECK (btrim(field_name) <> ''::text);

ALTER TABLE ONLY "log"."field_access_log_default"
  ADD CONSTRAINT "fal_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."field_access_log_default"
  ADD CONSTRAINT "fal_field_chk" CHECK (btrim(field_name) <> ''::text);

ALTER TABLE ONLY "log"."hash_anchor"
  ADD CONSTRAINT "ha_count_chk" CHECK (event_count >= 0);

ALTER TABLE ONLY "log"."hash_anchor"
  ADD CONSTRAINT "ha_hash_chk" CHECK (btrim(last_hash) <> ''::text);

ALTER TABLE ONLY "log"."job_log"
  ADD CONSTRAINT "jl_attempt_chk" CHECK (attempt_no >= 1);

ALTER TABLE ONLY "log"."job_log"
  ADD CONSTRAINT "jl_duration_chk" CHECK (duration_ms IS NULL OR duration_ms >= 0);

ALTER TABLE ONLY "log"."job_log"
  ADD CONSTRAINT "jl_status_chk" CHECK (status = ANY (ARRAY['success'::text, 'failed'::text, 'cancelled'::text, 'timeout'::text, 'skipped'::text]));

ALTER TABLE ONLY "log"."kpi_execution_log"
  ADD CONSTRAINT "kel_consumer_chk" CHECK (consumer_state = ANY (ARRAY['calculated'::text, 'reviewed'::text, 'approved'::text, 'published'::text]));

ALTER TABLE ONLY "log"."kpi_execution_log"
  ADD CONSTRAINT "kel_threshold_chk" CHECK (threshold_severity IS NULL OR (threshold_severity = ANY (ARRAY['ok'::text, 'info'::text, 'warning'::text, 'critical'::text])));

ALTER TABLE ONLY "log"."kpi_execution_log"
  ADD CONSTRAINT "kel_trigger_chk" CHECK (trigger_source IS NULL OR (trigger_source = ANY (ARRAY['manual'::text, 'scheduler'::text, 'period_close'::text, 'event'::text, 'pack_refresh'::text])));

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_duration_chk" CHECK (duration_ms >= 0);

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_method_chk" CHECK (request_method = ANY (ARRAY['GET'::text, 'POST'::text, 'PUT'::text, 'PATCH'::text, 'DELETE'::text]));

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_status_chk" CHECK (response_status IS NULL OR response_status >= 100 AND response_status <= 599);

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_url_chk" CHECK (btrim(request_url) <> ''::text);

ALTER TABLE ONLY "log"."notification_dlq"
  ADD CONSTRAINT "notification_dlq_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "log"."parameter_change_log"
  ADD CONSTRAINT "parameter_change_log_code_fmt" CHECK (parameter_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text);

ALTER TABLE ONLY "log"."parameter_change_log"
  ADD CONSTRAINT "parameter_change_log_operation_chk" CHECK (operation = ANY (ARRAY['create'::text, 'update'::text, 'disable_override'::text, 'enable_override'::text]));

ALTER TABLE ONLY "log"."password_history"
  ADD CONSTRAINT "ph_alg_chk" CHECK (hash_algorithm = ANY (ARRAY['bcrypt'::text, 'argon2id'::text, 'scrypt'::text, 'pbkdf2'::text]));

ALTER TABLE ONLY "log"."password_history"
  ADD CONSTRAINT "ph_hash_chk" CHECK (btrim(password_hash) <> ''::text);

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_decision_chk" CHECK (decision = ANY (ARRAY['allow'::text, 'deny'::text, 'not_found'::text, 'not_in_plan'::text, 'addon_required'::text, 'override_denied'::text, 'not_entitled'::text, 'not_granted'::text, 'module_not_subscribed'::text]));

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_object_chk" CHECK (num_nonnulls(permission_id, feature_id) = 1);

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_plan_gate_chk" CHECK (plan_gate_result IS NULL OR (plan_gate_result = ANY (ARRAY['allowed'::text, 'not_in_plan'::text, 'addon_required'::text, 'override'::text, 'skipped'::text])));

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_reason_chk" CHECK (btrim(decision_reason) <> ''::text);

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_decision_chk" CHECK (decision = ANY (ARRAY['allow'::text, 'deny'::text, 'not_found'::text, 'not_in_plan'::text, 'addon_required'::text, 'override_denied'::text, 'not_entitled'::text, 'not_granted'::text, 'module_not_subscribed'::text]));

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_object_chk" CHECK (num_nonnulls(permission_id, feature_id) = 1);

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_plan_gate_chk" CHECK (plan_gate_result IS NULL OR (plan_gate_result = ANY (ARRAY['allowed'::text, 'not_in_plan'::text, 'addon_required'::text, 'override'::text, 'skipped'::text])));

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_reason_chk" CHECK (btrim(decision_reason) <> ''::text);

ALTER TABLE ONLY "log"."platform_audit_log"
  ADD CONSTRAINT "pal_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."platform_audit_log"
  ADD CONSTRAINT "pal_operation_chk" CHECK (operation = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'bulk_import'::text, 'version_create'::text, 'access_grant'::text, 'access_revoke'::text]));

ALTER TABLE ONLY "log"."platform_audit_log"
  ADD CONSTRAINT "pal_row_count_chk" CHECK (row_count IS NULL OR row_count >= 0);

ALTER TABLE ONLY "log"."policy_evaluation_log"
  ADD CONSTRAINT "pel_conf_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "log"."policy_evaluation_log"
  ADD CONSTRAINT "pel_score_chk" CHECK (score IS NULL OR score >= 0::numeric AND score <= 1::numeric);

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_attempts_pos" CHECK (attempt_count >= 0);

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_category_chk" CHECK (error_category = ANY (ARRAY['transient'::text, 'permanent'::text, 'timeout'::text, 'crash'::text]));

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_error_code_chk" CHECK (btrim(error_code) <> ''::text);

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_replay_pos" CHECK (replay_count >= 0);

ALTER TABLE ONLY "log"."resolution_log"
  ADD CONSTRAINT "rl_confidence_chk" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE ONLY "log"."resolution_log"
  ADD CONSTRAINT "rl_step_chk" CHECK (resolution_step = ANY (ARRAY['CONTEXT'::text, 'INTENT'::text, 'PROFILE'::text]));

ALTER TABLE ONLY "log"."search_history"
  ADD CONSTRAINT "sh_query_chk" CHECK (btrim(query_text) <> ''::text);

ALTER TABLE ONLY "log"."search_history"
  ADD CONSTRAINT "sh_result_chk" CHECK (result_count IS NULL OR result_count >= 0);

ALTER TABLE ONLY "log"."search_history_default"
  ADD CONSTRAINT "sh_query_chk" CHECK (btrim(query_text) <> ''::text);

ALTER TABLE ONLY "log"."search_history_default"
  ADD CONSTRAINT "sh_result_chk" CHECK (result_count IS NULL OR result_count >= 0);

ALTER TABLE ONLY "log"."security_event_log"
  ADD CONSTRAINT "sel_outcome_chk" CHECK (outcome = ANY (ARRAY['success'::text, 'failure'::text, 'blocked'::text, 'partial'::text, 'expired'::text]));

ALTER TABLE ONLY "log"."security_event_log"
  ADD CONSTRAINT "sel_risk_chk" CHECK (risk_score IS NULL OR risk_score >= 0 AND risk_score <= 100);

ALTER TABLE ONLY "log"."security_event_log_default"
  ADD CONSTRAINT "sel_outcome_chk" CHECK (outcome = ANY (ARRAY['success'::text, 'failure'::text, 'blocked'::text, 'partial'::text, 'expired'::text]));

ALTER TABLE ONLY "log"."security_event_log_default"
  ADD CONSTRAINT "sel_risk_chk" CHECK (risk_score IS NULL OR risk_score >= 0 AND risk_score <= 100);

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_action_chk" CHECK (action = ANY (ARRAY['grant'::text, 'revoke'::text, 'modify'::text, 'expire'::text]));

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_entity_chk" CHECK (btrim(shared_entity_type) <> ''::text);

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_level_chk" CHECK (access_level = ANY (ARRAY['read'::text, 'edit'::text, 'full'::text]));

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_share_chk" CHECK (share_type = ANY (ARRAY['share_read'::text, 'share_edit'::text, 'delegate'::text]));

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_target_chk" CHECK (num_nonnulls(target_principal_id, target_group_id) = 1);

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_hash_curr_fmt" CHECK (hash_curr IS NULL OR hash_curr ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_hash_prev_fmt" CHECK (hash_prev IS NULL OR hash_prev ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_severity_chk" CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text]));

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "wel_entity_chk" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "wel_hash_curr_fmt" CHECK (hash_curr IS NULL OR hash_curr ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "wel_hash_prev_fmt" CHECK (hash_prev IS NULL OR hash_prev ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "wel_severity_chk" CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text]));

ALTER TABLE ONLY "log"."workspace_usage_metric"
  ADD CONSTRAINT "wum_key_chk" CHECK (btrim(metric_key) <> ''::text);

ALTER TABLE ONLY "log"."workspace_usage_metric"
  ADD CONSTRAINT "wum_period_chk" CHECK (period_end IS NULL OR period_end >= period_start);

ALTER TABLE ONLY "log"."activity_log"
  ADD CONSTRAINT "al_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."activity_log"
  ADD CONSTRAINT "al_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."activity_log"
  ADD CONSTRAINT "al_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."activity_log_default"
  ADD CONSTRAINT "al_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."activity_log_default"
  ADD CONSTRAINT "al_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."activity_log_default"
  ADD CONSTRAINT "al_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_run_fk" FOREIGN KEY (tenant_id, run_id) REFERENCES log.ai_agent_run(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."ai_agent_call"
  ADD CONSTRAINT "aac_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."ai_agent_run"
  ADD CONSTRAINT "aar_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."ai_calibration_log"
  ADD CONSTRAINT "acl_calibrated_by_fk" FOREIGN KEY (calibrated_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."ai_calibration_log"
  ADD CONSTRAINT "acl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."ai_call_transcript"
  ADD CONSTRAINT "act_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."ai_call_transcript"
  ADD CONSTRAINT "act_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."ai_call_transcript_default"
  ADD CONSTRAINT "act_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."ai_call_transcript_default"
  ADD CONSTRAINT "act_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."ai_feedback_log"
  ADD CONSTRAINT "afl_submitted_by_fk" FOREIGN KEY (submitted_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."ai_feedback_log"
  ADD CONSTRAINT "afl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."ai_inference_log"
  ADD CONSTRAINT "ail_accepted_by_fk" FOREIGN KEY (accepted_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."ai_inference_log"
  ADD CONSTRAINT "ail_reversed_by_fk" FOREIGN KEY (reversed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."ai_inference_log"
  ADD CONSTRAINT "ail_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."ai_monitoring_log"
  ADD CONSTRAINT "aml_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."attachment_access_log"
  ADD CONSTRAINT "aal_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."attachment_access_log"
  ADD CONSTRAINT "aal_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."attachment_access_log"
  ADD CONSTRAINT "aal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."attachment_access_log_default"
  ADD CONSTRAINT "aal_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."attachment_access_log_default"
  ADD CONSTRAINT "aal_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."attachment_access_log_default"
  ADD CONSTRAINT "aal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_reason_code_fk" FOREIGN KEY (reason_code) REFERENCES master.change_reason_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."audit_log"
  ADD CONSTRAINT "audit_log_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_reason_code_fk" FOREIGN KEY (reason_code) REFERENCES master.change_reason_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."audit_log_default"
  ADD CONSTRAINT "audit_log_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."close_activity_log"
  ADD CONSTRAINT "cal_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."close_activity_log"
  ADD CONSTRAINT "cal_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."close_activity_log"
  ADD CONSTRAINT "cal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."close_override_log"
  ADD CONSTRAINT "col_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."close_override_log"
  ADD CONSTRAINT "col_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."close_override_log"
  ADD CONSTRAINT "col_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."comment_retention_log"
  ADD CONSTRAINT "crl_executor_fk" FOREIGN KEY (executed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."comment_retention_log"
  ADD CONSTRAINT "crl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."cycle_audit_log"
  ADD CONSTRAINT "cal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."cycle_audit_log_default"
  ADD CONSTRAINT "cal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."dimension_resolution_log"
  ADD CONSTRAINT "drl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."entity_lifecycle_log"
  ADD CONSTRAINT "ell_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."entity_lifecycle_log"
  ADD CONSTRAINT "ell_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."entity_lifecycle_log"
  ADD CONSTRAINT "ell_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."export_log"
  ADD CONSTRAINT "el_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."export_log"
  ADD CONSTRAINT "el_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."export_log"
  ADD CONSTRAINT "el_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."field_access_log"
  ADD CONSTRAINT "fal_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."field_access_log"
  ADD CONSTRAINT "fal_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."field_access_log"
  ADD CONSTRAINT "fal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."field_access_log_default"
  ADD CONSTRAINT "fal_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."field_access_log_default"
  ADD CONSTRAINT "fal_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."field_access_log_default"
  ADD CONSTRAINT "fal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."hash_anchor"
  ADD CONSTRAINT "ha_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."job_log"
  ADD CONSTRAINT "jl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."kpi_execution_log"
  ADD CONSTRAINT "kel_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."notification_delivery_attempt"
  ADD CONSTRAINT "nda_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."password_history"
  ADD CONSTRAINT "ph_changed_by_fk" FOREIGN KEY (changed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."password_history"
  ADD CONSTRAINT "ph_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."password_history"
  ADD CONSTRAINT "ph_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_grant_fk" FOREIGN KEY (matched_grant_id) REFERENCES master.auth_override(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_group_fk" FOREIGN KEY (matched_group_id) REFERENCES master.auth_group(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_role_fk" FOREIGN KEY (matched_role_id) REFERENCES master.auth_role(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log"
  ADD CONSTRAINT "pdl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_grant_fk" FOREIGN KEY (matched_grant_id) REFERENCES master.auth_override(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_group_fk" FOREIGN KEY (matched_group_id) REFERENCES master.auth_group(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_permission_fk" FOREIGN KEY (permission_id) REFERENCES control.auth_permission(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_role_fk" FOREIGN KEY (matched_role_id) REFERENCES master.auth_role(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."permission_decision_log_default"
  ADD CONSTRAINT "pdl_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."policy_evaluation_log"
  ADD CONSTRAINT "pel_module_fk" FOREIGN KEY (module_id) REFERENCES shared.module(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."policy_evaluation_log"
  ADD CONSTRAINT "pel_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."render_dlq"
  ADD CONSTRAINT "render_dlq_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."search_history"
  ADD CONSTRAINT "sh_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."search_history"
  ADD CONSTRAINT "sh_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."search_history_default"
  ADD CONSTRAINT "sh_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."search_history_default"
  ADD CONSTRAINT "sh_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."security_event_log"
  ADD CONSTRAINT "sel_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."security_event_log"
  ADD CONSTRAINT "sel_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."security_event_log_default"
  ADD CONSTRAINT "sel_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."security_event_log_default"
  ADD CONSTRAINT "sel_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_cc_fk" FOREIGN KEY (company_code_id) REFERENCES master.company_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_grant_fk" FOREIGN KEY (access_grant_id) REFERENCES master.auth_override(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_target_group_fk" FOREIGN KEY (target_group_id) REFERENCES master.auth_group(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_target_principal_fk" FOREIGN KEY (target_principal_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."share_audit_log"
  ADD CONSTRAINT "sal_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."workflow_event_log"
  ADD CONSTRAINT "wel_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "wel_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "log"."workflow_event_log_default"
  ADD CONSTRAINT "wel_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."workspace_usage_metric"
  ADD CONSTRAINT "wum_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "log"."workspace_usage_metric"
  ADD CONSTRAINT "wum_workspace_fk" FOREIGN KEY (workspace_id) REFERENCES shared.workspace(id) ON DELETE CASCADE;
