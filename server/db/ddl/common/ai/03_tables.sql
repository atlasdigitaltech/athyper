-- Generated from the extracted live Atlas AI contract.
-- Regenerate with: node server/db/scripts/catalog/build-common-ai-ddl.mjs

CREATE TABLE "ai"."ai_action_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "doc_class" text,
  "autonomy_level" text DEFAULT 'suggest'::text NOT NULL,
  "min_confidence_for_auto" numeric(5,4),
  "requires_human_confirmation" boolean DEFAULT true NOT NULL,
  "override_policy_definition_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."ai_action_policy" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). R8: Atlas AI autonomy ceiling per tenant × action_code × doc_class. autonomy_level is the hard ceiling — runtime never exceeds it regardless of confidence. Layered lookup: (tenant, action, doc_class) → (tenant, action, NULL) → platform default. disabled=feature off; suggest=L1 surface only; assist=L2 pre-fill+confirm; auto=L3 act. min_confidence_for_auto: NULL defers to ai_confidence_threshold row for the same scope.';

COMMENT ON COLUMN "ai"."ai_action_policy"."action_code" IS 'Stable action identifier. E.g. classify, extract, suggest, autofill, approve, fx_rate.';

COMMENT ON COLUMN "ai"."ai_action_policy"."doc_class" IS 'Document class this policy applies to. NULL = applies to all classes for this action.';

CREATE TABLE "ai"."ai_confidence_threshold" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "doc_class" text,
  "model_id" text,
  "min_for_suggest" numeric(5,4) DEFAULT 0.5000 NOT NULL,
  "min_for_assist" numeric(5,4) DEFAULT 0.7000 NOT NULL,
  "min_for_auto" numeric(5,4) DEFAULT 0.9000 NOT NULL,
  "drift_alert_below" numeric(5,4),
  "drift_window_hours" smallint DEFAULT 24 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."ai_confidence_threshold" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). R8: tiered confidence thresholds governing Atlas AI autonomy levels. Three gate values (suggest ≤ assist ≤ auto) map to L1/L2/L3 autonomy. drift_alert_below: trigger drift alert when rolling-window avg confidence drops below this threshold. Layered lookup: (tenant, action, doc_class, model) → (tenant, action, doc_class, NULL) → (tenant, action, NULL, NULL).';

COMMENT ON COLUMN "ai"."ai_confidence_threshold"."model_id" IS 'Model version identifier (e.g. atlas-classifier-v3). NULL = applies to all models.';

COMMENT ON COLUMN "ai"."ai_confidence_threshold"."drift_window_hours" IS 'Lookback window for rolling-average confidence used in drift detection.';

CREATE TABLE "ai"."ai_drift_baseline" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "doc_class" text,
  "model_id" text NOT NULL,
  "baseline_date" date DEFAULT CURRENT_DATE NOT NULL,
  "sample_size" integer NOT NULL,
  "mean_confidence" numeric(7,6) NOT NULL,
  "std_dev_confidence" numeric(7,6) NOT NULL,
  "p5_confidence" numeric(7,6),
  "p95_confidence" numeric(7,6),
  "feature_stats" jsonb,
  "is_current" boolean DEFAULT false NOT NULL,
  "superseded_at" timestamp with time zone,
  "superseded_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."ai_drift_baseline" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_current boolean NOT NULL DEFAULT false (no status/is_active GENERATED). R8: statistical reference distributions for Atlas AI drift monitoring. One row per (tenant, action_code, doc_class, model_id, baseline_date). is_current=true marks the active reference for live drift comparison. superseded_by_id forms a history chain when baselines are refreshed. feature_stats holds per-field distributional stats for multivariate drift detection.';

COMMENT ON COLUMN "ai"."ai_drift_baseline"."model_id" IS 'Model version that produced this baseline. Baselines are model-version-specific.';

COMMENT ON COLUMN "ai"."ai_drift_baseline"."is_current" IS 'True for the single active baseline per (tenant, action_code, doc_class, model_id). Partial unique index adb_current_uq enforces at most one current baseline per scope.';

CREATE TABLE "ai"."atlas_conversation_retention_policy" (
  "tenant_id" uuid NOT NULL,
  "retention_days" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_conversation_retention_policy" IS 'ARCHETYPE=C;SCOPE=T. Server-resolved tenant retention override for Atlas transcripts. The runtime additionally enforces the platform minimum and maximum.';

CREATE TABLE "ai"."atlas_tenant_provider_credential" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "encrypted_secret" text NOT NULL,
  "key_version" integer NOT NULL,
  "rotation_epoch" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "activated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON COLUMN "ai"."atlas_tenant_provider_credential"."encrypted_secret" IS 'AES-256-GCM encrypted payload only. Plaintext provider credentials are forbidden.';

CREATE TABLE "ai"."atlas_tenant_provider_credential_epoch" (
  "tenant_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "rotation_epoch" integer DEFAULT 1 NOT NULL,
  "revoked" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL
);

CREATE TABLE "ai"."atlas_tenant_quota_policy" (
  "tenant_id" uuid NOT NULL,
  "max_requests" bigint NOT NULL,
  "max_input_tokens" bigint NOT NULL,
  "max_output_tokens" bigint NOT NULL,
  "window_seconds" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_tenant_quota_policy" IS 'Tenant-specific Atlas request and token limits. Runtime counters are stored separately in immutable time windows.';

CREATE TABLE "ai"."atlas_tenant_quota_window" (
  "tenant_id" uuid NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "window_ends_at" timestamp with time zone NOT NULL,
  "used_requests" bigint DEFAULT 0 NOT NULL,
  "used_input_tokens" bigint DEFAULT 0 NOT NULL,
  "used_output_tokens" bigint DEFAULT 0 NOT NULL,
  "reserved_input_tokens" bigint DEFAULT 0 NOT NULL,
  "reserved_output_tokens" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_tenant_quota_window" IS 'Serialized per-tenant Atlas request/token accounting window. Reserved counters prevent concurrent calls from overcommitting capacity.';

CREATE TABLE "ai"."atlas_tenant_quota_reservation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "plane_key" text NOT NULL,
  "principal_id" uuid NOT NULL,
  "reserved_input_tokens" bigint NOT NULL,
  "reserved_output_tokens" bigint NOT NULL,
  "actual_input_tokens" bigint,
  "actual_output_tokens" bigint,
  "status" text DEFAULT 'reserved' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "settled_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_tenant_quota_reservation" IS 'Idempotent Atlas capacity reservation. Expiry reclaims abandoned streams; late settlement still records actual usage in the originating window.';

-- ============================================================================
-- event/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "ai"."ai_tool_invocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "principal_id" uuid NOT NULL,
  "tool_call_id" text NOT NULL,
  "tool_code" text NOT NULL,
  "tool_version" text,
  "action_code" text,
  "input_hash" text,
  "operation_class" text NOT NULL,
  "risk_class" text NOT NULL,
  "autonomy_decision" text NOT NULL,
  "permission_snapshot" jsonb NOT NULL,
  "policy_snapshot" jsonb NOT NULL,
  "profile_snapshot" jsonb NOT NULL,
  "authorization_epoch" bigint NOT NULL,
  "policy_revision" text NOT NULL,
  "profile_revision" text NOT NULL,
  "proposal_summary" text NOT NULL,
  "affected_entity_type" text,
  "affected_entity_id" uuid,
  "expected_record_row_version" bigint,
  "confirmation_required" boolean DEFAULT false NOT NULL,
  "confirmation_policy" text DEFAULT 'none'::text NOT NULL,
  "confirmation_token_hash" text,
  "confirmation_actor_id" uuid,
  "confirmation_at" timestamp with time zone,
  "confirmation_expires_at" timestamp with time zone,
  "execution_guard_snapshot" jsonb,
  "execution_auth_epoch" bigint,
  "execution_policy_revision" text,
  "executing_at" timestamp with time zone,
  "downstream_command_idempotency_key" text,
  "business_transaction_type" text,
  "business_transaction_id" uuid,
  "result_hash" text,
  "evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'proposed'::text NOT NULL,
  "terminal_error_class" text,
  "terminal_at" timestamp with time zone,
  "duration_ms" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."ai_tool_invocation" IS 'ARCHETYPE=B_LITE;SCOPE=T;DEVIATION. Durable Atlas governed-tool lifecycle ledger. Proposal identity is immutable; authorization resolves at most once; terminal outcomes are immutable and purge only with the owning thread.';

COMMENT ON COLUMN "ai"."ai_tool_invocation"."input_hash" IS 'Lowercase SHA-256 of canonical validated arguments. NULL only when malformed or unavailable input cannot be safely canonicalized; raw arguments are never stored here.';

COMMENT ON COLUMN "ai"."ai_tool_invocation"."permission_snapshot" IS 'Bounded proposal-time permission, entity-capability, company-scope, and field-mask decision metadata.';

COMMENT ON COLUMN "ai"."ai_tool_invocation"."confirmation_token_hash" IS 'Lowercase SHA-256 of the server-signed confirmation token. The token itself is never persisted.';

COMMENT ON COLUMN "ai"."ai_tool_invocation"."execution_guard_snapshot" IS 'Bounded execution-time recheck metadata for auth epoch, policy, permission, lifecycle, field scope, and row version.';

COMMENT ON COLUMN "ai"."ai_tool_invocation"."evidence_refs" IS 'Opaque evidence identifiers and safe locators only; never raw evidence content.';

CREATE TABLE "ai"."atlas_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "principal_id" uuid NOT NULL,
  "client_request_id" uuid NOT NULL,
  "input_message_id" uuid NOT NULL,
  "output_message_id" uuid NOT NULL,
  "status" text DEFAULT 'started'::text NOT NULL,
  "cancellation_requested_at" timestamp with time zone,
  "cancellation_requested_by" uuid,
  "terminal_at" timestamp with time zone,
  "terminal_error_class" text,
  "metering_run_id" uuid,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_run" IS 'ARCHETYPE=B_LITE;SCOPE=T;SUBTYPE=TERMINAL_IMMUTABLE. Durable Atlas run and idempotency coordinator. Contains identifiers and lifecycle metadata only; prompt/response content belongs exclusively to ai.atlas_message.';

COMMENT ON COLUMN "ai"."atlas_run"."client_request_id" IS 'Tenant-unique client idempotency key. Retries return the existing run and messages.';

COMMENT ON COLUMN "ai"."atlas_run"."metering_run_id" IS 'Optional one-time reconciliation link to append-only ai.ai_agent_run.';

CREATE TABLE "ai"."ai_agent_call" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'system'::text NOT NULL,
  "run_id" uuid NOT NULL,
  "sequence_no" integer NOT NULL,
  "call_kind" text NOT NULL,
  "operation_id" text,
  "policy_revision" text,
  "data_handling_profile_id" text,
  "binding_id" text,
  "provider_id" text,
  "requested_model_id" text,
  "actual_model_id" text,
  "adapter_version" text,
  "prompt_version" text,
  "provider_request_id" text,
  "provider_region" text,
  "provider_account_class" text,
  "credential_owner" text,
  "credential_source" text,
  "credential_reference_hash" text,
  "credential_fingerprint" text,
  "outcome" text NOT NULL,
  "finish_reason" text,
  "error_code" text,
  "error_category" text,
  "is_retryable" boolean,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "usage_source" text DEFAULT 'unavailable'::text NOT NULL,
  "input_tokens" bigint,
  "cache_read_tokens" bigint,
  "cache_write_tokens" bigint,
  "output_tokens" bigint,
  "reasoning_tokens" bigint,
  "billable_units" numeric(20,6),
  "billable_unit_type" text,
  "cost_amount" numeric(20,8),
  "cost_currency" text DEFAULT 'USD'::text NOT NULL,
  "cost_basis" text,
  "price_version" text,
  "duration_ms" bigint NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "first_token_at" timestamp with time zone,
  "completed_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "ai"."ai_agent_call" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Terminal Atlas provider/tool/retrieval call ledger. Stores exact binding and operational metadata only; never prompt, response, arguments, results, or evidence content.';

COMMENT ON COLUMN "ai"."ai_agent_call"."operation_id" IS 'Safe registry identifier: model binding, governed capability, or retrieval profile. Never arguments or query text.';

COMMENT ON COLUMN "ai"."ai_agent_call"."provider_request_id" IS 'Provider-issued request identifier safe for support correlation; no response body is retained.';

COMMENT ON COLUMN "ai"."ai_agent_call"."provider_account_class" IS 'Reviewed provider account/data-use class effective for this exact call.';

COMMENT ON COLUMN "ai"."ai_agent_call"."credential_reference_hash" IS 'Versioned keyed fingerprint of the approved credential reference. Never the raw secret reference.';

COMMENT ON COLUMN "ai"."ai_agent_call"."credential_fingerprint" IS 'Versioned keyed fingerprint for rotation/reconciliation. Never an API key, secret reference, or key suffix.';

CREATE TABLE "ai"."ai_agent_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'system'::text NOT NULL,
  "principal_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "client_request_id" uuid NOT NULL,
  "response_message_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "policy_revision" text,
  "data_handling_profile_id" text,
  "requested_model_id" text NOT NULL,
  "resolved_binding_id" text,
  "resolved_provider_id" text,
  "actual_model_id" text,
  "adapter_version" text,
  "provider_region" text,
  "provider_account_class" text,
  "prompt_version" text,
  "outcome" text NOT NULL,
  "finish_reason" text,
  "error_code" text,
  "error_category" text,
  "is_retryable" boolean,
  "usage_source" text DEFAULT 'unavailable'::text NOT NULL,
  "input_tokens" bigint,
  "cache_read_tokens" bigint,
  "cache_write_tokens" bigint,
  "output_tokens" bigint,
  "reasoning_tokens" bigint,
  "model_call_count" integer DEFAULT 0 NOT NULL,
  "tool_call_count" integer DEFAULT 0 NOT NULL,
  "retrieval_call_count" integer DEFAULT 0 NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "billable_units" numeric(20,6),
  "billable_unit_type" text,
  "cost_amount" numeric(20,8),
  "cost_currency" text DEFAULT 'USD'::text NOT NULL,
  "cost_basis" text,
  "price_version" text,
  "duration_ms" bigint NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "first_token_at" timestamp with time zone,
  "completed_at" timestamp with time zone NOT NULL,
  "correlation_id" uuid,
  "trace_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "ai"."ai_agent_run" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Terminal Atlas request ledger. Stores routing, outcome, usage, cost, and timing metadata only; never prompt or response content.';

COMMENT ON COLUMN "ai"."ai_agent_run"."response_message_id" IS 'Server-generated assistant message identifier used to bind feedback to this exact run response.';

COMMENT ON COLUMN "ai"."ai_agent_run"."requested_model_id" IS 'Public model identifier requested by the client before policy/binding resolution.';

COMMENT ON COLUMN "ai"."ai_agent_run"."resolved_binding_id" IS 'Exact immutable binding/profile selected by policy for this run.';

COMMENT ON COLUMN "ai"."ai_agent_run"."actual_model_id" IS 'Primary upstream model actually invoked; NULL when rejected before provider invocation.';

COMMENT ON COLUMN "ai"."ai_agent_run"."provider_account_class" IS 'Reviewed provider account/data-use class effective for the resolved binding; NULL before provider resolution.';

COMMENT ON COLUMN "ai"."ai_agent_run"."error_code" IS 'Canonical Atlas error code only. Raw provider error bodies must never be stored.';

CREATE TABLE "ai"."ai_calibration_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text DEFAULT 'system'::text NOT NULL,
  "model_id" uuid,
  "calibration_type" text,
  "threshold_before" numeric,
  "threshold_after" numeric,
  "calibration_trigger" text,
  "metric_name" text,
  "metric_value" numeric,
  "sample_count" integer,
  "calibration_detail" jsonb,
  "calibrated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "ai"."ai_calibration_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI threshold calibration history. before/after values with trigger reason for governance and rollback.';

CREATE TABLE "ai"."ai_call_transcript" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "session_id" text NOT NULL,
  "principal_id" uuid,
  "entity_type" text,
  "entity_id" uuid,
  "transcript_text" text,
  "transcript_engine" text,
  "language_code" character(5),
  "confidence" numeric(5,4),
  "duration_seconds" integer,
  "segments" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "ai"."ai_call_transcript" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. AI voice call transcripts. Reclassified from user-activity to AI domain. Partitioned monthly.';

CREATE TABLE "ai"."ai_feedback_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "feedback_type" text NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "target_id" uuid,
  "verdict" text,
  "reason_code" text,
  "reason_detail" text,
  "is_outcome_verified" boolean DEFAULT false NOT NULL,
  "outcome_notes" text,
  "evidence_snapshot" jsonb,
  "detail" jsonb,
  "submitted_by" uuid NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "ai"."ai_feedback_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI feedback log. Replaces atlas_feedback + classification_feedback. feedback_type in log.ai_feedback_type lookup.';

CREATE TABLE "ai"."ai_inference_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'system'::text NOT NULL,
  "inference_type" text NOT NULL,
  "model_id" uuid NOT NULL,
  "model_version" text,
  "target_engine" text,
  "txn_id" uuid,
  "confidence" numeric(5,4),
  "reasoning_chain" jsonb,
  "input" jsonb,
  "output" jsonb,
  "action_type" text,
  "reversal_window_expires_at" timestamp with time zone,
  "reversed_at" timestamp with time zone,
  "reversed_by" uuid,
  "prediction_type" text,
  "is_accepted" boolean,
  "accepted_by" uuid,
  "accepted_at" timestamp with time zone,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "ai"."ai_inference_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI inference log. Replaces ai_action + ai_prediction. inference_type=action: action_type, reversal_window. inference_type=prediction: prediction_type, is_accepted.';

CREATE TABLE "ai"."ai_monitoring_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'system'::text NOT NULL,
  "monitor_type" text NOT NULL,
  "model_id" uuid,
  "entity_type" text,
  "entity_id" uuid,
  "metric_name" text NOT NULL,
  "metric_value" numeric,
  "baseline_value" numeric,
  "is_alert" boolean DEFAULT false NOT NULL,
  "is_alert_sent" boolean DEFAULT false NOT NULL,
  "window_start" timestamp with time zone,
  "window_end" timestamp with time zone,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "ai"."ai_monitoring_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI monitoring log. Replaces ai_drift_monitor + atlas_anomaly_baseline. detail carries type-specific statistical fields.';

CREATE TABLE "ai"."ai_call_transcript_default"
  PARTITION OF "ai"."ai_call_transcript"
  DEFAULT;

CREATE TABLE "ai"."atlas_knowledge_chunk" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "ordinal" integer NOT NULL,
  "character_start" integer NOT NULL,
  "character_end" integer NOT NULL,
  "checksum" text NOT NULL,
  "embedding_model" text,
  "index_status" text DEFAULT 'pending'::text NOT NULL,
  "index_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "ai"."atlas_knowledge_chunk" IS 'ARCHETYPE=C;SCOPE=T. Chunk locator and index state; it intentionally stores no customer text.';

CREATE TABLE "ai"."atlas_knowledge_revision" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "source_version_id" text NOT NULL,
  "checksum" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "indexed_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "ai"."atlas_knowledge_revision" IS 'ARCHETYPE=C;SCOPE=T. Immutable source revision and checksum used to reject stale retrieval candidates.';

CREATE TABLE "ai"."atlas_knowledge_source" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_kind" text NOT NULL,
  "source_id" text NOT NULL,
  "entity_code" text,
  "permission_code" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_knowledge_source" IS 'ARCHETYPE=C;SCOPE=T. Tenant-controlled Atlas retrieval source with required effective read permission.';

CREATE TABLE "ai"."atlas_message" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "sequence" bigint DEFAULT 0 NOT NULL,
  "role" text NOT NULL,
  "content_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "protected_content_ref" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "run_id" uuid,
  "parent_message_id" uuid,
  "result_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "citation_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tool_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "terminal_error_class" text,
  "terminal_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_message" IS 'ARCHETYPE=C;SCOPE=T;SUBTYPE=TERMINAL_IMMUTABLE. Ordered Atlas transcript message. Pending assistant content may be finalized once; terminal rows are immutable. Operational logs and metering rows must not duplicate content from this table.';

COMMENT ON COLUMN "ai"."atlas_message"."sequence" IS 'Strictly monotonic per conversation. Allocated under an atlas_thread row lock.';

COMMENT ON COLUMN "ai"."atlas_message"."content_blocks" IS 'Portable Atlas content blocks. Must be empty when protected_content_ref is used.';

COMMENT ON COLUMN "ai"."atlas_message"."terminal_error_class" IS 'Safe bounded error classification only; never a raw provider error or prompt fragment.';

CREATE TABLE "ai"."atlas_thread" (
  "conversation_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "owner_principal_id" uuid NOT NULL,
  "retention_policy_id" text,
  "expires_at" timestamp with time zone,
  "purge_after" timestamp with time zone,
  "legal_hold" boolean DEFAULT false NOT NULL,
  "legal_hold_reference" text,
  "summary_blocks" jsonb,
  "protected_summary_ref" text,
  "summary_version" integer DEFAULT 0 NOT NULL,
  "last_message_sequence" bigint DEFAULT 0 NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "ai"."atlas_thread" IS 'ARCHETYPE=C;SCOPE=T. One-to-one Atlas state for a document.conversation. Principal-private by default. The plane and owner are immutable. Transcript ordering is controlled by last_message_sequence.';

COMMENT ON COLUMN "ai"."atlas_thread"."retention_policy_id" IS 'Stable, versioned server-resolved retention policy identifier. Never accepted as client authority.';

COMMENT ON COLUMN "ai"."atlas_thread"."protected_summary_ref" IS 'Opaque reference to protected summary content. Never a provider conversation identifier.';

COMMENT ON COLUMN "ai"."atlas_thread"."row_version" IS 'Optimistic concurrency token incremented by a database trigger on every update.';
