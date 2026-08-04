-- ============================================================================
-- event/03_constraints.sql
-- Table constraints reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."authorization_global_epoch_v2"
  ADD CONSTRAINT "authorization_global_epoch_v2_pkey" PRIMARY KEY (singleton_id);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."authorization_plane_epoch_v2"
  ADD CONSTRAINT "authorization_plane_epoch_v2_pkey" PRIMARY KEY (tenant_id, plane_code);

ALTER TABLE ONLY "event"."authorization_tenant_epoch_v2"
  ADD CONSTRAINT "authorization_tenant_epoch_v2_pkey" PRIMARY KEY (tenant_id);

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."connector_instance"
  ADD CONSTRAINT "connector_instance_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."document_runtime_document_version"
  ADD CONSTRAINT "drdv_pkey" PRIMARY KEY (tenant_id, entity_code, document_id);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_pkey" PRIMARY KEY (cursor);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."document_runtime_node_version"
  ADD CONSTRAINT "drnv_pkey" PRIMARY KEY (tenant_id, entity_code, document_id, node_key);

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "event"."notification_delivery_claim"
  ADD CONSTRAINT "ndcl_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "notification_delivery_default_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."orchestration_node"
  ADD CONSTRAINT "orch_node_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."orchestration_run"
  ADD CONSTRAINT "orch_run_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."webhook_subscription"
  ADD CONSTRAINT "ws_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_call_uq" UNIQUE (tenant_id, run_id, tool_call_id);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_scope_id_uq" UNIQUE (tenant_id, thread_id, plane, id);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_client_request_uq" UNIQUE (tenant_id, client_request_id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_input_uq" UNIQUE (tenant_id, conversation_id, plane, input_message_id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_output_uq" UNIQUE (tenant_id, conversation_id, plane, output_message_id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_scope_id_uq" UNIQUE (tenant_id, conversation_id, plane, id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_idempotency_uq" UNIQUE (idempotency_key);

ALTER TABLE ONLY "event"."connector_instance"
  ADD CONSTRAINT "connector_instance_code_uq" UNIQUE (tenant_id, code);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_id_uq" UNIQUE (id);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_scope_version_uq" UNIQUE (tenant_id, entity_code, document_id, document_version);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_scope_uq" UNIQUE (tenant_id, principal_id, operation_key, idempotency_key);

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_code_uq" UNIQUE (tenant_id, service, code);

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."notification_delivery_claim"
  ADD CONSTRAINT "ndcl_idempotency_uq" UNIQUE (tenant_id, idempotency_key);

ALTER TABLE ONLY "event"."orchestration_node"
  ADD CONSTRAINT "orch_node_run_code" UNIQUE (run_id, node_code);

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_device_uq" UNIQUE (tenant_id, principal_id, plane_key, platform, device_id);

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."webhook_subscription"
  ADD CONSTRAINT "ws_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_phone_uq" UNIQUE (tenant_id, principal_id, phone_e164);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_tenant_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_tenant_id_uq" UNIQUE (tenant_id, id);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_action_code_chk" CHECK (action_code IS NULL OR action_code ~ '^[a-z][a-z0-9_.:-]{0,127}$'::text);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_authorization_epoch_chk" CHECK (authorization_epoch >= 0);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_autonomy_chk" CHECK (autonomy_decision = ANY (ARRAY['not_evaluated'::text, 'denied'::text, 'suggest'::text, 'assist'::text, 'auto'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_bounded_json_chk" CHECK (octet_length(permission_snapshot::text) <= 32768 AND octet_length(policy_snapshot::text) <= 32768 AND octet_length(profile_snapshot::text) <= 32768 AND (execution_guard_snapshot IS NULL OR octet_length(execution_guard_snapshot::text) <= 32768) AND octet_length(evidence_refs::text) <= 65536);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_business_ref_chk" CHECK (business_transaction_type IS NULL AND business_transaction_id IS NULL OR status = 'completed'::text AND business_transaction_type IS NOT NULL AND btrim(business_transaction_type) <> ''::text AND octet_length(business_transaction_type) <= 128 AND business_transaction_id IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_chk" CHECK (confirmation_required = false AND confirmation_policy = 'none'::text AND confirmation_token_hash IS NULL AND confirmation_actor_id IS NULL AND confirmation_at IS NULL AND confirmation_expires_at IS NULL OR confirmation_required = true AND confirmation_policy <> 'none'::text AND confirmation_token_hash IS NOT NULL AND confirmation_expires_at IS NOT NULL AND confirmation_expires_at > created_at AND (confirmation_actor_id IS NULL AND confirmation_at IS NULL OR confirmation_actor_id IS NOT NULL AND confirmation_at IS NOT NULL AND confirmation_at >= created_at AND confirmation_at <= confirmation_expires_at) AND ((status <> ALL (ARRAY['confirmed'::text, 'executing'::text, 'completed'::text])) OR confirmation_actor_id IS NOT NULL) AND (status <> 'proposed'::text OR confirmation_actor_id IS NULL));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_hash_chk" CHECK (confirmation_token_hash IS NULL OR confirmation_token_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_policy_chk" CHECK (confirmation_policy = ANY (ARRAY['none'::text, 'explicit'::text, 'step_up'::text, 'dual_control'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmed_state_chk" CHECK (status <> 'confirmed'::text OR confirmation_required = true AND operation_class <> 'unresolved'::text AND risk_class <> 'unknown'::text AND (autonomy_decision = ANY (ARRAY['suggest'::text, 'assist'::text, 'auto'::text])) AND tool_version IS NOT NULL AND action_code IS NOT NULL AND input_hash IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_duration_state_chk" CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text])) AND duration_ms IS NULL OR (status = ANY (ARRAY['completed'::text, 'denied'::text, 'failed'::text, 'expired'::text, 'cancelled'::text])) AND duration_ms IS NOT NULL AND duration_ms >= 0);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_entity_chk" CHECK (affected_entity_type IS NULL AND affected_entity_id IS NULL OR affected_entity_type IS NOT NULL AND btrim(affected_entity_type) <> ''::text AND octet_length(affected_entity_type) <= 128 AND affected_entity_id IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_evidence_chk" CHECK (jsonb_typeof(evidence_refs) = 'array'::text AND octet_length(evidence_refs::text) <= 65536 AND (status = 'completed'::text OR evidence_refs = '[]'::jsonb));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_executable_chk" CHECK ((status <> ALL (ARRAY['executing'::text, 'completed'::text])) OR operation_class <> 'unresolved'::text AND risk_class <> 'unknown'::text AND (autonomy_decision = ANY (ARRAY['suggest'::text, 'assist'::text, 'auto'::text])) AND tool_version IS NOT NULL AND action_code IS NOT NULL AND input_hash IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_executable_identity_chk" CHECK ((status <> ALL (ARRAY['executing'::text, 'completed'::text])) OR tool_version IS NOT NULL AND action_code IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_execution_guard_chk" CHECK (executing_at IS NULL AND execution_guard_snapshot IS NULL AND execution_auth_epoch IS NULL AND execution_policy_revision IS NULL OR executing_at IS NOT NULL AND execution_guard_snapshot IS NOT NULL AND jsonb_typeof(execution_guard_snapshot) = 'object'::text AND execution_guard_snapshot <> '{}'::jsonb AND octet_length(execution_guard_snapshot::text) <= 32768 AND execution_auth_epoch IS NOT NULL AND execution_auth_epoch >= 0 AND execution_policy_revision IS NOT NULL AND btrim(execution_policy_revision) <> ''::text AND octet_length(execution_policy_revision) <= 256);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_execution_state_chk" CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'denied'::text, 'expired'::text])) AND executing_at IS NULL OR (status = ANY (ARRAY['executing'::text, 'completed'::text])) AND executing_at IS NOT NULL OR (status = ANY (ARRAY['failed'::text, 'cancelled'::text])));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_expected_version_chk" CHECK (expected_record_row_version IS NULL OR expected_record_row_version >= 0 AND affected_entity_id IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_expiry_chk" CHECK (status <> 'expired'::text OR confirmation_required = true AND confirmation_expires_at IS NOT NULL AND terminal_at >= confirmation_expires_at);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_input_hash_chk" CHECK (input_hash IS NULL OR input_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_mutation_execution_chk" CHECK (operation_class <> 'mutate'::text OR confirmation_required = true AND (autonomy_decision = ANY (ARRAY['suggest'::text, 'assist'::text])) AND (executing_at IS NULL OR downstream_command_idempotency_key IS NOT NULL));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_mutation_idempotency_chk" CHECK (downstream_command_idempotency_key IS NULL OR btrim(downstream_command_idempotency_key) <> ''::text AND octet_length(downstream_command_idempotency_key) <= 256 AND executing_at IS NOT NULL);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_operation_class_chk" CHECK (operation_class = ANY (ARRAY['unresolved'::text, 'read'::text, 'propose'::text, 'mutate'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_outcome_chk" CHECK ((status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text])) AND terminal_at IS NULL AND terminal_error_class IS NULL AND result_hash IS NULL AND business_transaction_id IS NULL AND duration_ms IS NULL OR status = 'completed'::text AND terminal_at IS NOT NULL AND terminal_error_class IS NULL AND result_hash IS NOT NULL AND duration_ms IS NOT NULL AND duration_ms >= 0 OR (status = ANY (ARRAY['denied'::text, 'failed'::text, 'expired'::text, 'cancelled'::text])) AND terminal_at IS NOT NULL AND terminal_error_class IS NOT NULL AND btrim(terminal_error_class) <> ''::text AND octet_length(terminal_error_class) <= 128 AND result_hash IS NULL AND business_transaction_id IS NULL AND duration_ms IS NOT NULL AND duration_ms >= 0);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_permission_snapshot_chk" CHECK (jsonb_typeof(permission_snapshot) = 'object'::text AND permission_snapshot <> '{}'::jsonb AND octet_length(permission_snapshot::text) <= 32768);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_policy_snapshot_chk" CHECK (jsonb_typeof(policy_snapshot) = 'object'::text AND policy_snapshot <> '{}'::jsonb AND octet_length(policy_snapshot::text) <= 32768);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_profile_snapshot_chk" CHECK (jsonb_typeof(profile_snapshot) = 'object'::text AND profile_snapshot <> '{}'::jsonb AND octet_length(profile_snapshot::text) <= 32768);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_result_hash_chk" CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_revision_chk" CHECK (btrim(policy_revision) <> ''::text AND octet_length(policy_revision) <= 256 AND btrim(profile_revision) <> ''::text AND octet_length(profile_revision) <= 256);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_risk_class_chk" CHECK (risk_class = ANY (ARRAY['unknown'::text, 'low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_status_chk" CHECK (status = ANY (ARRAY['proposed'::text, 'confirmed'::text, 'executing'::text, 'completed'::text, 'denied'::text, 'failed'::text, 'expired'::text, 'cancelled'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_summary_chk" CHECK (btrim(proposal_summary) <> ''::text AND octet_length(proposal_summary) <= 4096);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_time_chk" CHECK ((confirmation_at IS NULL OR confirmation_at >= created_at) AND (executing_at IS NULL OR executing_at >= created_at) AND (executing_at IS NULL OR confirmation_at IS NULL OR executing_at >= confirmation_at) AND (terminal_at IS NULL OR terminal_at >= created_at) AND (terminal_at IS NULL OR executing_at IS NULL OR terminal_at >= executing_at));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tool_call_id_chk" CHECK (btrim(tool_call_id) <> ''::text AND octet_length(tool_call_id) <= 256);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tool_code_chk" CHECK (tool_code ~ '^[A-Za-z0-9_-]{1,128}$'::text);

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tool_version_chk" CHECK (tool_version IS NULL OR tool_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'::text);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_cancel_request_chk" CHECK (cancellation_requested_at IS NULL AND cancellation_requested_by IS NULL OR cancellation_requested_at IS NOT NULL AND cancellation_requested_by = principal_id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_error_chk" CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text])) AND terminal_error_class IS NULL OR (status = ANY (ARRAY['failed'::text, 'cancelled'::text])) AND terminal_error_class IS NOT NULL AND btrim(terminal_error_class) <> ''::text);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_messages_distinct_chk" CHECK (input_message_id <> output_message_id);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_plane_chk" CHECK (plane = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_status_chk" CHECK (status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_terminal_chk" CHECK (status = 'started'::text AND terminal_at IS NULL OR (status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])) AND terminal_at IS NOT NULL);

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_time_chk" CHECK (created_at >= started_at AND (terminal_at IS NULL OR terminal_at >= started_at) AND (cancellation_requested_at IS NULL OR cancellation_requested_at >= started_at));

ALTER TABLE ONLY "event"."authorization_global_epoch_v2"
  ADD CONSTRAINT "authorization_global_epoch_v2_epoch_chk" CHECK (epoch >= 0);

ALTER TABLE ONLY "event"."authorization_global_epoch_v2"
  ADD CONSTRAINT "authorization_global_epoch_v2_singleton_chk" CHECK (singleton_id = 1);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_attempts_chk" CHECK (attempts >= 0 AND max_attempts > 0);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_boundary_chk" CHECK (boundary_kind = ANY (ARRAY['mutation'::text, 'effective_start'::text, 'effective_end'::text]));

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_cause_chk" CHECK (cause_source_database_id IS NULL AND cause_source_watermark IS NULL AND cause_replay_transaction_id IS NULL OR cause_source_database_id IS NOT NULL AND cause_source_watermark IS NOT NULL AND cause_source_watermark >= 0);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_epoch_chk" CHECK (epoch_applied_at IS NULL AND global_epoch IS NULL AND tenant_epoch IS NULL AND plane_epoch IS NULL OR epoch_applied_at IS NOT NULL AND global_epoch IS NOT NULL AND global_epoch >= 0 AND (scope_kind = 'global'::text AND global_epoch > 0 AND tenant_epoch IS NULL AND plane_epoch IS NULL OR scope_kind = 'tenant'::text AND tenant_epoch IS NOT NULL AND tenant_epoch > 0 AND plane_epoch IS NULL OR scope_kind = 'plane'::text AND tenant_epoch IS NOT NULL AND tenant_epoch >= 0 AND plane_epoch IS NOT NULL AND plane_epoch > 0));

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_idempotency_chk" CHECK (idempotency_key ~ '^[0-9a-f]{64}$'::text);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_ids_chk" CHECK (array_position(affected_principal_ids, NULL::uuid) IS NULL AND array_position(affected_group_ids, NULL::uuid) IS NULL AND array_position(affected_role_ids, NULL::uuid) IS NULL AND array_position(affected_permission_set_ids, NULL::uuid) IS NULL AND array_position(affected_permission_ids, NULL::uuid) IS NULL AND array_position(affected_scope_ids, NULL::uuid) IS NULL AND array_position(affected_record_ids, NULL::uuid) IS NULL AND array_position(affected_delegation_ids, NULL::uuid) IS NULL);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_lease_chk" CHECK (locked_at IS NULL AND locked_by IS NULL AND locked_until IS NULL OR locked_at IS NOT NULL AND locked_by IS NOT NULL AND locked_until IS NOT NULL AND locked_until > locked_at);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_processed_chk" CHECK (status = 'completed'::text AND processed_at IS NOT NULL OR status <> 'completed'::text AND processed_at IS NULL);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_scope_chk" CHECK (scope_kind = 'global'::text AND tenant_id IS NULL AND plane_code IS NULL OR scope_kind = 'tenant'::text AND tenant_id IS NOT NULL AND plane_code IS NULL OR scope_kind = 'plane'::text AND tenant_id IS NOT NULL AND (plane_code = ANY (ARRAY['neon'::text, 'admin'::text])));

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_source_chk" CHECK ((authority_schema = ANY (ARRAY['shared'::text, 'control'::text, 'master'::text])) AND authority_table ~ '^[a-z][a-z0-9_]*$'::text AND (authority_operation = ANY (ARRAY['I'::bpchar, 'U'::bpchar, 'D'::bpchar])) AND jsonb_typeof(source_row_key) = 'object'::text AND source_row_key <> '{}'::jsonb);

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'dead_letter'::text, 'superseded'::text]));

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_time_chk" CHECK (available_at >= effective_at AND available_at >= created_at);

ALTER TABLE ONLY "event"."authorization_plane_epoch_v2"
  ADD CONSTRAINT "authorization_plane_epoch_v2_epoch_chk" CHECK (epoch >= 0);

ALTER TABLE ONLY "event"."authorization_plane_epoch_v2"
  ADD CONSTRAINT "authorization_plane_epoch_v2_plane_chk" CHECK (plane_code = ANY (ARRAY['neon'::text, 'admin'::text]));

ALTER TABLE ONLY "event"."authorization_tenant_epoch_v2"
  ADD CONSTRAINT "authorization_tenant_epoch_v2_epoch_chk" CHECK (epoch >= 0);

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_actioned_note_chk" CHECK (status <> 'actioned'::text OR review_note IS NOT NULL);

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_review_chk" CHECK (status = 'pending'::text AND reviewed_at IS NULL AND reviewed_by IS NULL OR (status = ANY (ARRAY['reviewed'::text, 'dismissed'::text, 'actioned'::text])) AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL);

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text, 'actioned'::text]));

ALTER TABLE ONLY "event"."connector_instance"
  ADD CONSTRAINT "connector_instance_health_chk" CHECK (health_status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text, 'unknown'::text]));

ALTER TABLE ONLY "event"."connector_instance"
  ADD CONSTRAINT "connector_instance_status_chk" CHECK (status = ANY (ARRAY['active'::text, 'testing'::text, 'paused'::text, 'error'::text, 'deprecated'::text]));

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_event_chk" CHECK (btrim(event_code) <> ''::text);

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_template_chk" CHECK (btrim(template_key) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_document_version"
  ADD CONSTRAINT "drdv_entity_chk" CHECK (btrim(entity_code) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_document_version"
  ADD CONSTRAINT "drdv_version_chk" CHECK (document_version >= 1);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_entity_chk" CHECK (btrim(entity_code) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_payload_chk" CHECK (jsonb_typeof(payload) = 'object'::text);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_retention_chk" CHECK (retained_until > occurred_at);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_type_chk" CHECK (btrim(event_type) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_version_chk" CHECK (document_version >= 1);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_entity_chk" CHECK (btrim(entity_code) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_expiry_chk" CHECK (expires_at > created_at);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_hash_chk" CHECK (length(request_hash) >= 64);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_key_chk" CHECK (btrim(idempotency_key) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_lease_chk" CHECK (lease_expires_at <= expires_at);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_operation_chk" CHECK (btrim(operation_key) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_response_chk" CHECK (status = 'in_progress'::text AND response_status IS NULL AND response_payload IS NULL AND completed_at IS NULL OR (status = ANY (ARRAY['succeeded'::text, 'failed'::text])) AND response_status IS NOT NULL AND completed_at IS NOT NULL);

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_status_chk" CHECK (status = ANY (ARRAY['in_progress'::text, 'succeeded'::text, 'failed'::text]));

ALTER TABLE ONLY "event"."document_runtime_node_version"
  ADD CONSTRAINT "drnv_entity_chk" CHECK (btrim(entity_code) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_node_version"
  ADD CONSTRAINT "drnv_node_chk" CHECK (btrim(node_key) <> ''::text);

ALTER TABLE ONLY "event"."document_runtime_node_version"
  ADD CONSTRAINT "drnv_version_chk" CHECK (node_version >= 1);

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_code_chk" CHECK (btrim(code) <> ''::text);

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_health_chk" CHECK (health = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text]));

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_method_chk" CHECK (method = ANY (ARRAY['GET'::text, 'POST'::text, 'PUT'::text, 'PATCH'::text, 'DELETE'::text]));

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_path_chk" CHECK (btrim(path) <> ''::text);

ALTER TABLE ONLY "event"."endpoint"
  ADD CONSTRAINT "endpoint_service_chk" CHECK (btrim(service) <> ''::text);

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_entity_chk" CHECK (btrim(entity_name) <> ''::text AND btrim(entity_id) <> ''::text);

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_fire_after_chk" CHECK (fire_at >= scheduled_at);

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_snapshot_chk" CHECK (jsonb_typeof(policy_snapshot) = 'object'::text);

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_status_chk" CHECK (status = ANY (ARRAY['scheduled'::text, 'fired'::text, 'cancelled'::text, 'failed'::text]));

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_timer_type_chk" CHECK (timer_type = ANY (ARRAY['auto_close'::text, 'auto_cancel'::text, 'reminder'::text, 'auto_transition'::text]));

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_addr_chk" CHECK (btrim(recipient_addr) <> ''::text);

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_attempts_chk" CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts);

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_error_cat_chk" CHECK (error_category IS NULL OR (error_category = ANY (ARRAY['transient'::text, 'permanent'::text, 'rate_limit'::text, 'auth'::text])));

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_origin_chk" CHECK (message_id IS NOT NULL OR channel = 'webhook'::text AND outbox_id IS NOT NULL);

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "event"."notification_delivery_claim"
  ADD CONSTRAINT "ndcl_channel_chk" CHECK (btrim(channel) <> ''::text);

ALTER TABLE ONLY "event"."notification_delivery_claim"
  ADD CONSTRAINT "ndcl_expiry_chk" CHECK (expires_at > claimed_at);

ALTER TABLE ONLY "event"."notification_delivery_claim"
  ADD CONSTRAINT "ndcl_key_chk" CHECK (btrim(idempotency_key) <> ''::text);

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_addr_chk" CHECK (btrim(recipient_addr) <> ''::text);

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_attempts_chk" CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts);

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_error_cat_chk" CHECK (error_category IS NULL OR (error_category = ANY (ARRAY['transient'::text, 'permanent'::text, 'rate_limit'::text, 'auth'::text])));

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_origin_chk" CHECK (message_id IS NOT NULL OR channel = 'webhook'::text AND outbox_id IS NOT NULL);

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_counts_chk" CHECK (recipient_count >= 0 AND delivered_count >= 0 AND failed_count >= 0 AND (delivered_count + failed_count) <= recipient_count);

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_event_chk" CHECK (btrim(event_id) <> ''::text);

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_expiry_chk" CHECK (expires_at IS NULL OR expires_at > created_at);

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_plane_key_chk" CHECK (plane_key = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'planning'::text, 'delivering'::text, 'completed'::text, 'partial'::text, 'failed'::text]));

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_template_chk" CHECK (btrim(template_key) <> ''::text);

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_version_chk" CHECK (template_version >= 1);

ALTER TABLE ONLY "event"."orchestration_node"
  ADD CONSTRAINT "orch_node_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text, 'canceled'::text]));

ALTER TABLE ONLY "event"."orchestration_run"
  ADD CONSTRAINT "orch_run_status_chk" CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'canceled'::text]));

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_attempts_chk" CHECK (attempts >= 0);

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_locked_chk" CHECK (locked_at IS NULL AND locked_by IS NULL AND locked_until IS NULL OR locked_at IS NOT NULL AND locked_by IS NOT NULL AND locked_until IS NOT NULL);

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_max_attempts_chk" CHECK (max_attempts > 0);

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'dead_letter'::text]));

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_topic_chk" CHECK (btrim(topic) <> ''::text);

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_endpoint_chk" CHECK (btrim(endpoint) <> ''::text);

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_mobile_token_chk" CHECK (platform = 'web'::text OR device_token IS NOT NULL);

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_plane_key_chk" CHECK (plane_key = ANY (ARRAY['neon'::text, 'mesh'::text, 'admin'::text]));

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_platform_chk" CHECK (platform = ANY (ARRAY['web'::text, 'android'::text, 'ios'::text]));

ALTER TABLE ONLY "event"."push_subscription"
  ADD CONSTRAINT "ps_web_keys_chk" CHECK (platform <> 'web'::text OR p256dh_key IS NOT NULL AND auth_key IS NOT NULL);

ALTER TABLE ONLY "event"."webhook_subscription"
  ADD CONSTRAINT "ws_failure_chk" CHECK (failure_count >= 0);

ALTER TABLE ONLY "event"."webhook_subscription"
  ADD CONSTRAINT "ws_retries_chk" CHECK (max_retries >= 0);

ALTER TABLE ONLY "event"."webhook_subscription"
  ADD CONSTRAINT "ws_timeout_chk" CHECK (timeout_ms > 0);

ALTER TABLE ONLY "event"."webhook_subscription"
  ADD CONSTRAINT "ws_url_chk" CHECK (btrim(target_url) <> ''::text);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_consent_chk" CHECK (consent_status = 'opted_in'::text AND consented_at IS NOT NULL OR consent_status <> 'opted_in'::text);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_phone_chk" CHECK (phone_e164 ~ '^\+[1-9]\d{1,14}$'::text);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_revoke_chk" CHECK (consent_status = 'revoked'::text AND revoked_at IS NOT NULL OR consent_status <> 'revoked'::text);

ALTER TABLE ONLY "event"."whatsapp_consent"
  ADD CONSTRAINT "wac_status_chk" CHECK (consent_status = ANY (ARRAY['pending'::text, 'opted_in'::text, 'opted_out'::text, 'revoked'::text]));

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_assignee_chk" CHECK (status = 'pending'::text OR assignee_id IS NOT NULL OR assignee_group_id IS NOT NULL OR assignee_team_id IS NOT NULL);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_completed_chk" CHECK ((status <> ALL (ARRAY['completed'::text, 'skipped'::text, 'escalated'::text])) OR completed_at IS NOT NULL);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_due_at_chk" CHECK (due_at IS NULL OR due_at > created_at);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_metadata_chk" CHECK (jsonb_typeof(metadata) = 'object'::text);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_order_chk" CHECK (order_index >= 1);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_request_stage_chk" CHECK (workflow_request_id IS NOT NULL AND workflow_stage_id IS NOT NULL OR workflow_request_id IS NOT NULL AND workflow_stage_id IS NULL OR workflow_request_id IS NULL AND workflow_stage_id IS NULL);

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text, 'escalated'::text]));

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_confirmation_actor_fk" FOREIGN KEY (tenant_id, confirmation_actor_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_run_fk" FOREIGN KEY (tenant_id, thread_id, plane, run_id) REFERENCES event.atlas_run(tenant_id, conversation_id, plane, id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_thread_fk" FOREIGN KEY (tenant_id, thread_id, plane) REFERENCES master.atlas_thread(tenant_id, conversation_id, plane) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."ai_tool_invocation"
  ADD CONSTRAINT "ai_tool_invocation_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_cancelled_by_fk" FOREIGN KEY (tenant_id, cancellation_requested_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_created_by_fk" FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_input_message_fk" FOREIGN KEY (tenant_id, conversation_id, plane, input_message_id) REFERENCES master.atlas_message(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_metering_fk" FOREIGN KEY (tenant_id, metering_run_id) REFERENCES log.ai_agent_run(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_output_message_fk" FOREIGN KEY (tenant_id, conversation_id, plane, output_message_id) REFERENCES master.atlas_message(tenant_id, conversation_id, plane, id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_principal_fk" FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_thread_fk" FOREIGN KEY (tenant_id, conversation_id, plane) REFERENCES master.atlas_thread(tenant_id, conversation_id, plane) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."atlas_run"
  ADD CONSTRAINT "atlas_run_updated_by_fk" FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."authorization_invalidation_outbox_v2"
  ADD CONSTRAINT "authorization_invalidation_outbox_v2_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE ONLY "event"."authorization_plane_epoch_v2"
  ADD CONSTRAINT "authorization_plane_epoch_v2_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE ONLY "event"."authorization_tenant_epoch_v2"
  ADD CONSTRAINT "authorization_tenant_epoch_v2_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_flagged_by_fk" FOREIGN KEY (flagged_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_reviewed_by_fk" FOREIGN KEY (reviewed_by) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."comment_flag"
  ADD CONSTRAINT "cf_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."connector_instance"
  ADD CONSTRAINT "connector_instance_connector_type_id_fkey" FOREIGN KEY (connector_type_id) REFERENCES control.connector_type(id);

ALTER TABLE ONLY "event"."connector_instance"
  ADD CONSTRAINT "connector_instance_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id);

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_message_fk" FOREIGN KEY (message_id) REFERENCES event.notification_message(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_recipient_fk" FOREIGN KEY (recipient_id) REFERENCES master.principal(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."digest_staging"
  ADD CONSTRAINT "ds_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."document_runtime_document_version"
  ADD CONSTRAINT "drdv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."document_runtime_document_version"
  ADD CONSTRAINT "drdv_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_actor_fk" FOREIGN KEY (actor_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."document_runtime_event"
  ADD CONSTRAINT "dre_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_principal_fk" FOREIGN KEY (principal_id) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."document_runtime_idempotency"
  ADD CONSTRAINT "dri_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."document_runtime_node_version"
  ADD CONSTRAINT "drnv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."document_runtime_node_version"
  ADD CONSTRAINT "drnv_updated_by_fk" FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_lifecycle_fk" FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_policy_fk" FOREIGN KEY (policy_id) REFERENCES control.lifecycle_timer_policy(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_state_fk" FOREIGN KEY (state_id) REFERENCES control.lifecycle_state(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."lifecycle_timer_schedule"
  ADD CONSTRAINT "lts_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_message_fk" FOREIGN KEY (message_id) REFERENCES event.notification_message(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_outbox_fk" FOREIGN KEY (outbox_id) REFERENCES event.outbox(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_provider_fk" FOREIGN KEY (provider_id) REFERENCES control.notification_provider(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_recipient_fk" FOREIGN KEY (recipient_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."notification_delivery"
  ADD CONSTRAINT "ndlv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_message_fk" FOREIGN KEY (message_id) REFERENCES event.notification_message(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_outbox_fk" FOREIGN KEY (outbox_id) REFERENCES event.outbox(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_provider_fk" FOREIGN KEY (provider_id) REFERENCES control.notification_provider(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_recipient_fk" FOREIGN KEY (recipient_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."notification_delivery_default"
  ADD CONSTRAINT "ndlv_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_rule_fk" FOREIGN KEY (rule_id) REFERENCES control.notification_routing_rule(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."notification_message"
  ADD CONSTRAINT "nmsg_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."orchestration_node"
  ADD CONSTRAINT "orchestration_node_run_id_fkey" FOREIGN KEY (run_id) REFERENCES event.orchestration_run(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."orchestration_node"
  ADD CONSTRAINT "orchestration_node_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id);

ALTER TABLE ONLY "event"."orchestration_run"
  ADD CONSTRAINT "orchestration_run_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id);

ALTER TABLE ONLY "event"."outbox"
  ADD CONSTRAINT "outbox_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_assignee_fk" FOREIGN KEY (assignee_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_assignee_group_fk" FOREIGN KEY (assignee_group_id) REFERENCES master.auth_group(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_assignee_team_fk" FOREIGN KEY (assignee_team_id) REFERENCES master.team(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_created_by_fk" FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_designated_fk" FOREIGN KEY (designated_id) REFERENCES master.principal(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_designated_group_fk" FOREIGN KEY (designated_group_id) REFERENCES master.auth_group(id) ON DELETE SET NULL;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_request_fk" FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_stage_fk" FOREIGN KEY (tenant_id, workflow_stage_id) REFERENCES document.workflow_stage(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY "event"."work_item"
  ADD CONSTRAINT "wi_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
