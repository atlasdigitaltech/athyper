-- ============================================================================
-- log/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "log"."activity_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "domain" text NOT NULL,
  "activity_type" text NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "actor_id" uuid,
  "actor_type" text,
  "company_code_id" uuid,
  "detail" jsonb,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."activity_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Consolidated domain activity log. Replaces 9 thin tables: kpi_activity, pack_activity, pack_release_activity, planning_activity, close_override_activity, approval_event, comment_read, comment_response, recent_activity. domain + activity_type controlled via control.lookup_domain (both extensible). All domain-specific FKs live in detail jsonb.';

COMMENT ON COLUMN "log"."activity_log"."domain" IS 'Activity domain. Lookup: log.activity_domain (is_extensible=true).';

COMMENT ON COLUMN "log"."activity_log"."activity_type" IS 'Activity type within domain. Lookup: log.activity_type (is_extensible=true).';

COMMENT ON COLUMN "log"."activity_log"."detail" IS 'Domain-specific payload. kpi={kpi_id,execution_id,calculation_run_id,fiscal_year,period_number}, pack={pack_instance_id}, release={release_id}, planning={model_id,driver_id,formula_id}, approval={approval_instance_id}, user={comment_id,parent_comment_id,entity_name}.';

CREATE TABLE "log"."ai_agent_call" (
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

COMMENT ON TABLE "log"."ai_agent_call" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Terminal Atlas provider/tool/retrieval call ledger. Stores exact binding and operational metadata only; never prompt, response, arguments, results, or evidence content.';

COMMENT ON COLUMN "log"."ai_agent_call"."operation_id" IS 'Safe registry identifier: model binding, governed capability, or retrieval profile. Never arguments or query text.';

COMMENT ON COLUMN "log"."ai_agent_call"."provider_request_id" IS 'Provider-issued request identifier safe for support correlation; no response body is retained.';

COMMENT ON COLUMN "log"."ai_agent_call"."provider_account_class" IS 'Reviewed provider account/data-use class effective for this exact call.';

COMMENT ON COLUMN "log"."ai_agent_call"."credential_reference_hash" IS 'Versioned keyed fingerprint of the approved credential reference. Never the raw secret reference.';

COMMENT ON COLUMN "log"."ai_agent_call"."credential_fingerprint" IS 'Versioned keyed fingerprint for rotation/reconciliation. Never an API key, secret reference, or key suffix.';

CREATE TABLE "log"."ai_agent_run" (
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

COMMENT ON TABLE "log"."ai_agent_run" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Terminal Atlas request ledger. Stores routing, outcome, usage, cost, and timing metadata only; never prompt or response content.';

COMMENT ON COLUMN "log"."ai_agent_run"."response_message_id" IS 'Server-generated assistant message identifier used to bind feedback to this exact run response.';

COMMENT ON COLUMN "log"."ai_agent_run"."requested_model_id" IS 'Public model identifier requested by the client before policy/binding resolution.';

COMMENT ON COLUMN "log"."ai_agent_run"."resolved_binding_id" IS 'Exact immutable binding/profile selected by policy for this run.';

COMMENT ON COLUMN "log"."ai_agent_run"."actual_model_id" IS 'Primary upstream model actually invoked; NULL when rejected before provider invocation.';

COMMENT ON COLUMN "log"."ai_agent_run"."provider_account_class" IS 'Reviewed provider account/data-use class effective for the resolved binding; NULL before provider resolution.';

COMMENT ON COLUMN "log"."ai_agent_run"."error_code" IS 'Canonical Atlas error code only. Raw provider error bodies must never be stored.';

CREATE TABLE "log"."ai_calibration_log" (
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

COMMENT ON TABLE "log"."ai_calibration_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI threshold calibration history. before/after values with trigger reason for governance and rollback.';

CREATE TABLE "log"."ai_call_transcript" (
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

COMMENT ON TABLE "log"."ai_call_transcript" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. AI voice call transcripts. Reclassified from user-activity to AI domain. Partitioned monthly.';

CREATE TABLE "log"."ai_feedback_log" (
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

COMMENT ON TABLE "log"."ai_feedback_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI feedback log. Replaces atlas_feedback + classification_feedback. feedback_type in log.ai_feedback_type lookup.';

CREATE TABLE "log"."ai_inference_log" (
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

COMMENT ON TABLE "log"."ai_inference_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI inference log. Replaces ai_action + ai_prediction. inference_type=action: action_type, reversal_window. inference_type=prediction: prediction_type, is_accepted.';

CREATE TABLE "log"."ai_monitoring_log" (
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

COMMENT ON TABLE "log"."ai_monitoring_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. AI monitoring log. Replaces ai_drift_monitor + atlas_anomaly_baseline. detail carries type-specific statistical fields.';

CREATE TABLE "log"."atlas_byok_audit" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "event" text NOT NULL,
  "rotation_epoch" integer,
  "reference_fingerprint" text,
  "actor_principal_id" uuid,
  "correlation_id" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "log"."attachment_access_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "principal_id" uuid NOT NULL,
  "company_code_id" uuid,
  "attachment_id" uuid NOT NULL,
  "parent_entity_type" text,
  "parent_entity_id" uuid,
  "access_type" text NOT NULL,
  "attachment_name" text,
  "attachment_size_bytes" bigint,
  "attachment_mime_type" text,
  "ip_address" inet,
  "user_agent" text,
  "request_id" text,
  "correlation_id" uuid,
  "outcome" text DEFAULT 'success'::text NOT NULL,
  "failure_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."attachment_access_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Attachment download/preview audit. access_type in log.attachment_access_type lookup (extensible). Partitioned monthly.';

COMMENT ON COLUMN "log"."attachment_access_log"."attachment_name" IS 'Denormalised at access time — survives rename/delete of source attachment.';

CREATE TABLE "log"."audit_dlq" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "queue_name" text NOT NULL,
  "job_name" text NOT NULL,
  "payload" jsonb NOT NULL,
  "error_message" text NOT NULL,
  "retry_count" smallint DEFAULT 0 NOT NULL,
  "last_attempted_at" timestamp with time zone NOT NULL,
  "retried_at" timestamp with time zone,
  "retried_job_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "log"."audit_dlq" IS 'ARCHETYPE=C;SCOPE=T;SUBTYPE=APPEND_ONLY. Dead-letter queue for failed audit-domain background jobs. Phase 3.3 WorkerFramework. insertDlq() target: ''log.audit_dlq''. retried_at/retried_job_id set once by retryFromDlq() (minor in-place UPDATE; rest of row immutable).';

CREATE TABLE "log"."audit_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "actor_id" uuid,
  "actor_type" text,
  "company_code_id" uuid,
  "old_values" jsonb,
  "new_values" jsonb,
  "changed_fields" text[],
  "reason_code" uuid,
  "correlation_id" uuid,
  "request_id" text,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."audit_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Generic entity mutation trail. actor_type in log.actor_type lookup. Partitioned monthly.';

COMMENT ON COLUMN "log"."audit_log"."old_values" IS 'Column snapshot before operation. NULL for inserts.';

COMMENT ON COLUMN "log"."audit_log"."new_values" IS 'Column snapshot after operation. NULL for deletes.';

COMMENT ON COLUMN "log"."audit_log"."reason_code" IS 'Optional FK to master.change_reason_code. Required on high-risk paths (manual GL override, posting adjustment, restore_snapshot) — enforced by service layer, not DB.';

COMMENT ON COLUMN "log"."audit_log"."correlation_id" IS 'Links to event.outbox id for end-to-end trace.';

CREATE TABLE "log"."auth_decision_evidence_v2" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "decision" text NOT NULL,
  "reason_code" text NOT NULL,
  "evaluator_contract_version" text NOT NULL,
  "evaluator_revision" text NOT NULL,
  "acting_principal_id" uuid,
  "subject_principal_id" uuid NOT NULL,
  "external_identity_sha256" text,
  "permission_id" uuid NOT NULL,
  "entity_operation_id" uuid,
  "resource_type" text,
  "resource_key_sha256" text,
  "global_epoch" bigint NOT NULL,
  "tenant_epoch" bigint NOT NULL,
  "plane_epoch" bigint NOT NULL,
  "entitlement_version" text NOT NULL,
  "catalog_sha256" text NOT NULL,
  "role_compilation_sha256" text NOT NULL,
  "matched_plane_membership_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_group_membership_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_group_assignment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_role_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_compiled_permission_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_scope_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_deny_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_override_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_record_acl_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "matched_delegation_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "evidence_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence_sha256" text NOT NULL,
  "request_id" text,
  "correlation_id" uuid,
  "evaluation_microseconds" bigint,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
)
PARTITION BY RANGE (observed_at);

COMMENT ON TABLE "log"."auth_decision_evidence_v2" IS 'Append-only canonical evaluator evidence. It records immutable proof IDs, catalog/compiler hashes, entitlement version, and global/tenant/plane epochs without raw identity subjects, resource keys, or policy bodies.';

CREATE TABLE "log"."close_activity_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "activity_type" text NOT NULL,
  "fiscal_year" smallint,
  "period_number" smallint,
  "close_period_id" uuid,
  "actor_id" uuid,
  "actor_type" text,
  "company_code_id" uuid,
  "detail" jsonb,
  "outcome" text,
  "outcome_detail" text,
  "correlation_id" uuid,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."close_activity_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Finance close activity log. Replaces 5 tables: close_automation_audit, close_task_duration_history, period_close_activity, release_decision_log, remediation_preview_log. activity_type in log.close_activity_type lookup. close_period_id FK added in Phase 4 once ledger.close_period exists.';

COMMENT ON COLUMN "log"."close_activity_log"."detail" IS 'Type-specific payload. automation_audit={automation_rule_id,policy_id,verdict,gate_evidence}, task_duration={task_id,task_code,started_at,completed_at,duration_minutes}, period_close={close_step,step_status}, release_decision={release_id,certification_id,distribution_id,result}, remediation_preview={action_id,campaign_id,impact_summary,blocking_reasons}.';

CREATE TABLE "log"."close_override_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "activity_type" text NOT NULL,
  "book_code" text,
  "fiscal_year" smallint,
  "period_number" smallint,
  "override_id" uuid,
  "run_id" uuid,
  "event_type" text,
  "from_status" text,
  "to_status" text,
  "actor_id" uuid NOT NULL,
  "actor_type" text,
  "company_code_id" uuid,
  "reason" text,
  "evidence" jsonb,
  "correlation_id" uuid,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."close_override_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Period-close override + book close audit. activity_type=book_close_audit rows carry from_status/to_status. Absorbs log.book_close_audit_log.';

CREATE TABLE "log"."comment_retention_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text DEFAULT 'business'::text NOT NULL,
  "comment_type" text NOT NULL,
  "comment_id" uuid NOT NULL,
  "action" text NOT NULL,
  "policy_id" uuid,
  "executed_by" uuid,
  "executed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "comment_snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."comment_retention_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Compliance comment retention audit. Driven by control.comment_retention_policy.';

CREATE TABLE "log"."cycle_audit_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid,
  "cycle_type_code" character varying(30),
  "domain" character varying(20) NOT NULL,
  "event_type" character varying(40) NOT NULL,
  "cycle_run_id" uuid,
  "target_id" uuid,
  "target_type" character varying(30),
  "actor_id" uuid,
  "actor_type" character varying(20) DEFAULT 'USER'::character varying NOT NULL,
  "from_status" character varying(30),
  "to_status" character varying(30),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."cycle_audit_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Unified immutable audit trail for the governance cycle model. Partitioned monthly by created_at. Append-only — no UPDATE/DELETE policies for tenant role. pg_partman manages monthly children.';

COMMENT ON COLUMN "log"."cycle_audit_log"."actor_id" IS 'Business-domain actor who triggered the event. May be NULL for system-initiated events (e.g. scheduler). Distinct from created_by.';

COMMENT ON COLUMN "log"."cycle_audit_log"."created_by" IS 'Session principal who inserted this log entry. Distinct from actor_id which represents the business-domain actor (may differ for system-initiated events).';

CREATE TABLE "log"."descriptor_cache_invalidation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "tenant_id" uuid,
  "entity_code" text,
  "plane_key" text,
  "reason" text NOT NULL,
  "triggered_by_table" text,
  "triggered_by_id" uuid,
  "processed_at" timestamp with time zone,
  "processed_by" text,
  "redis_keys_deleted" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."descriptor_cache_invalidation" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Descriptor cache invalidation events. Source of truth for cache busting; pg_notify fans out the same event to the Node listener. Partitioned monthly. processed_at IS NULL rows are the poller-fallback work queue.';

COMMENT ON COLUMN "log"."descriptor_cache_invalidation"."processed_at" IS 'Set by listener after Redis DEL succeeds. The 30s poller treats NULL rows as work to do.';

CREATE TABLE "log"."dimension_resolution_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "dimension_type_id" uuid,
  "resolved_value_id" uuid,
  "resolution_strategy" text,
  "resolution_detail" jsonb,
  "is_fallback" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."dimension_resolution_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Dimension resolution trace. Records how each value was determined (direct, inherited, default, fallback).';

CREATE TABLE "log"."entity_lifecycle_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "lifecycle_id" uuid,
  "operation_code" text,
  "from_status" text,
  "to_status" text NOT NULL,
  "from_state_id" uuid,
  "to_state_id" uuid,
  "actor_id" uuid,
  "actor_type" text,
  "company_code_id" uuid,
  "remarks" text,
  "payload" jsonb,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "revision_no" smallint DEFAULT 0 NOT NULL,
  "revision_label" text
);

COMMENT ON TABLE "log"."entity_lifecycle_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Entity state-machine transition audit. Distinct from audit_log (column mutations). Feeds state compliance reporting.';

COMMENT ON COLUMN "log"."entity_lifecycle_log"."revision_no" IS 'Amendment cycle counter. 0 = original. Incremented when status transitions to ''amending''.';

COMMENT ON COLUMN "log"."entity_lifecycle_log"."revision_label" IS 'Human label for the revision group, e.g. ''Original'', ''Amendment 1''.';

CREATE TABLE "log"."export_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "export_type" text NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "actor_id" uuid NOT NULL,
  "company_code_id" uuid,
  "export_format" text,
  "file_name" text,
  "file_size_bytes" bigint,
  "content_hash" text,
  "hash_algorithm" text,
  "ip_address" inet,
  "user_agent" text,
  "detail" jsonb,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."export_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Consolidated export/download audit. Replaces: release_export_log, statement_export_log, pack_download_log. export_type in log.export_type lookup (extensible). detail carries type-specific fields.';

COMMENT ON COLUMN "log"."export_log"."detail" IS 'release={release_id,certification_id,is_clean_close_at_export,export_version}, statement={instance_id,period_id,statement_type}, pack_download={distribution_id,format}.';

CREATE TABLE "log"."field_access_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "principal_id" uuid NOT NULL,
  "company_code_id" uuid,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "field_name" text NOT NULL,
  "field_classification" text NOT NULL,
  "access_purpose" text,
  "access_justification" text,
  "ip_address" inet,
  "user_agent" text,
  "request_id" text,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."field_access_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. PII/sensitive field read audit. field_classification in log.field_classification lookup (extensible — tenants add custom classes). Partitioned monthly.';

CREATE TABLE "log"."hash_anchor" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "anchor_date" date NOT NULL,
  "last_hash" text NOT NULL,
  "event_count" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."hash_anchor" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Daily tamper-evidence anchors. One row per (tenant, anchor_date). last_hash = SHA-256 of previous anchor + all events of the day.';

CREATE TABLE "log"."job_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "job_type" text,
  "flow_id" uuid,
  "run_id" uuid,
  "step_index" smallint,
  "step_type" text,
  "status" text NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "duration_ms" integer,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "attempt_no" smallint DEFAULT 1 NOT NULL,
  "purge_after" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."job_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Job step + run completion history. Active jobs in event.outbox. On completion/failure: write summary here + mark outbox completed.';

CREATE TABLE "log"."kpi_execution_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text DEFAULT 'business'::text NOT NULL,
  "kpi_id" uuid NOT NULL,
  "kpi_version" smallint,
  "company_code_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "dimension_set_id" uuid,
  "book_code" text DEFAULT 'STAT'::text NOT NULL,
  "value" numeric(18,4) NOT NULL,
  "comparison_value" numeric(18,4),
  "variance_amount" numeric(18,4),
  "variance_pct" numeric(8,4),
  "threshold_severity" text,
  "formula_inputs" jsonb,
  "definition_snapshot" jsonb,
  "calculation_run_id" uuid,
  "execution_job_id" uuid,
  "trigger_source" text,
  "is_current" boolean DEFAULT true NOT NULL,
  "consumer_state" text DEFAULT 'calculated'::text NOT NULL,
  "published_to_pack_id" uuid,
  "publication_batch_id" uuid,
  "correlation_id" uuid,
  "period_status_at_calc" text,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."kpi_execution_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. KPI calculation results. Kept separate from activity_log — financial columns need direct SQL aggregation. is_current flags latest calculation for (kpi_id, company_code_id, fiscal_year, period).';

CREATE TABLE "log"."notification_delivery_attempt" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "delivery_id" uuid,
  "subscription_id" uuid,
  "request_url" text NOT NULL,
  "request_method" text DEFAULT 'POST'::text NOT NULL,
  "request_headers" jsonb,
  "request_body" text,
  "request_content_type" text,
  "response_status" integer,
  "response_headers" jsonb,
  "response_body" text,
  "response_content_type" text,
  "duration_ms" integer NOT NULL,
  "is_success" boolean NOT NULL,
  "error" text,
  "is_redacted" boolean DEFAULT false NOT NULL,
  "redaction_version" text,
  "body_truncated" boolean DEFAULT false NOT NULL,
  "purge_after" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."notification_delivery_attempt" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. HTTP request/response trace per delivery attempt. Replaces log.delivery_log. Append-only with scoped UPDATE carve-out for credential scrubbing: DELETE blocked; UPDATE restricted to is_redacted, redaction_version, purge_after only. Enforced by 09_triggers/008_log.sql.';

COMMENT ON COLUMN "log"."notification_delivery_attempt"."is_redacted" IS 'Set true by credential-scrubbing worker after redacting sensitive headers/body.';

COMMENT ON COLUMN "log"."notification_delivery_attempt"."purge_after" IS 'When set, the purge job hard-deletes this row. Allows GDPR-driven retention.';

CREATE TABLE "log"."notification_dlq" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "queue_name" text NOT NULL,
  "job_name" text NOT NULL,
  "payload" jsonb NOT NULL,
  "error_message" text NOT NULL,
  "retry_count" smallint DEFAULT 0 NOT NULL,
  "last_attempted_at" timestamp with time zone NOT NULL,
  "retried_at" timestamp with time zone,
  "retried_job_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "log"."notification_dlq" IS 'ARCHETYPE=C;SCOPE=T;SUBTYPE=APPEND_ONLY. Dead-letter queue for failed notification-domain background jobs. Phase 3.3 WorkerFramework. insertDlq() target: ''log.notification_dlq''. retried_at/retried_job_id set once by retryFromDlq() (minor in-place UPDATE; rest of row immutable).';

CREATE TABLE "log"."parameter_change_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "parameter_code" text NOT NULL,
  "actor_principal_id" uuid,
  "operation" text NOT NULL,
  "old_override_enabled" boolean,
  "new_override_enabled" boolean,
  "old_value" jsonb,
  "new_value" jsonb,
  "reason" text,
  "request_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."parameter_change_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Audit trail for tenant parameter override changes.';

CREATE TABLE "log"."password_history" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "principal_id" uuid NOT NULL,
  "password_hash" text NOT NULL,
  "hash_algorithm" text DEFAULT 'bcrypt'::text NOT NULL,
  "hash_version" smallint DEFAULT 1 NOT NULL,
  "change_reason" text,
  "changed_by" uuid,
  "ip_address" inet,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."password_history" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Password hash history. RLS: NO tenant read. Admin-only. change_reason in log.password_change_reason lookup. Not partitioned — per-user bounded volume.';

COMMENT ON COLUMN "log"."password_history"."hash_version" IS 'Hash parameter version — allows rotation without invalidating existing rows.';

CREATE TABLE "log"."permission_decision_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "principal_id" uuid NOT NULL,
  "persona_code" text,
  "permission_id" uuid,
  "permission_code" text,
  "feature_id" uuid,
  "feature_code" text,
  "entity_type" text,
  "entity_id" uuid,
  "module_code" text,
  "decision" text NOT NULL,
  "decision_reason" text NOT NULL,
  "scope_applied" text,
  "company_code_id" uuid,
  "matched_grant_id" uuid,
  "matched_role_id" uuid,
  "matched_group_id" uuid,
  "plan_gate_result" text,
  "evaluation_ms" integer,
  "request_id" text,
  "correlation_id" uuid,
  "ip_address" inet,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."permission_decision_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Auth-engine allow/deny decisions. Exactly one of permission_id/feature_id per row. Partitioned monthly.';

COMMENT ON COLUMN "log"."permission_decision_log"."evaluation_ms" IS 'Auth-engine latency for performance monitoring.';

CREATE TABLE "log"."platform_audit_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "operation" text NOT NULL,
  "actor_id" uuid NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "checksum" text,
  "row_count" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "log"."platform_audit_log" IS 'ARCHETYPE=D;SCOPE=N;SUBTYPE=APPEND_ONLY. Audit trail for shared.* schema mutations. No tenant_id — shared tables are global. entity_type = schema.table_name. checksum/row_count populated for bulk_import operations.';

CREATE TABLE "log"."policy_evaluation_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "txn_id" uuid,
  "pipeline_id" uuid,
  "module_id" uuid,
  "module_version" text,
  "config_hash" text,
  "score" numeric(5,4),
  "action" text,
  "conditions" jsonb,
  "approvers" jsonb,
  "sla_hours" smallint,
  "explanation" text,
  "confidence" numeric(5,4),
  "evaluation_ms" integer,
  "evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."policy_evaluation_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Policy engine scoring record. score and confidence are 0.0–1.0 fractions.';

CREATE TABLE "log"."render_dlq" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "output_id" uuid NOT NULL,
  "render_job_id" uuid,
  "error_code" text NOT NULL,
  "error_detail" text,
  "error_category" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "replayed_at" timestamp with time zone,
  "replayed_by" uuid,
  "replay_count" integer DEFAULT 0 NOT NULL,
  "dead_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "log"."render_dlq" IS 'ARCHETYPE=E;SCOPE=T. Dead-letter queue for permanently failed render attempts. EXCEPTION CLASS: queue_operational — lives in log schema but is mutable (replay updates status). Has updated_at/updated_by unlike append-only log tables. Not partitioned — operational table with low row volume.';

COMMENT ON COLUMN "log"."render_dlq"."updated_at" IS 'Set on replay (status change). Auto-populated by trg_render_dlq_updated_at.';

COMMENT ON COLUMN "log"."render_dlq"."updated_by" IS 'Principal who triggered the replay.';

CREATE TABLE "log"."resolution_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "pipeline_id" uuid NOT NULL,
  "txn_id" uuid NOT NULL,
  "resolution_step" text NOT NULL,
  "direction" text NOT NULL,
  "flow_code" text,
  "company_code_id" uuid,
  "doc_type" text,
  "amount" numeric(18,4),
  "currency_code" text,
  "is_cross_border" boolean,
  "is_intercompany" boolean,
  "counterparty_type" text,
  "confidence" numeric(3,2),
  "resolution_method" text,
  "explanation" text,
  "matched_rule_id" uuid,
  "matched_override_id" uuid,
  "rules_evaluated" smallint,
  "evaluation_ms" integer,
  "was_overridden" boolean DEFAULT false NOT NULL,
  "override_by" uuid,
  "override_reason" text,
  "original_resolved_id" uuid,
  "classification_source" text,
  "classification_id" uuid,
  "resolved_intent_id" uuid,
  "resolved_domain" text,
  "resolved_profile_config_id" uuid,
  "resolved_profile_code" text,
  "subledger_type" text,
  "profile_type" text,
  "profile_version" integer,
  "event_count" smallint,
  "entry_template_count" smallint,
  "book_rule_count" smallint,
  "creates_commitment" boolean,
  "has_paired_profile" boolean,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."resolution_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Engine 4.13: unified resolution audit trail. 3 rows per transaction: CONTEXT (input snapshot), INTENT (Step 4), PROFILE (Step 4.5). Append-only: immutability trigger prevents UPDATE and DELETE. Partial indexes in 07_indexes for step-specific queries.';

CREATE TABLE "log"."search_history" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text DEFAULT 'business'::text NOT NULL,
  "principal_id" uuid NOT NULL,
  "query_text" text NOT NULL,
  "query_hash" text,
  "entity_type" text,
  "result_count" integer,
  "duration_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."search_history" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Principal search activity. query_hash enables dedup of repeated identical queries. Partitioned monthly.';

CREATE TABLE "log"."security_event_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "event_category" text NOT NULL,
  "event_type" text NOT NULL,
  "outcome" text NOT NULL,
  "principal_id" uuid,
  "actor_type" text,
  "session_id" text,
  "ip_address" inet,
  "user_agent" text,
  "device_fingerprint" text,
  "country_code" character(2),
  "mfa_method" text,
  "mfa_channel" text,
  "risk_score" smallint,
  "risk_flags" text[],
  "detail" jsonb,
  "failure_reason" text,
  "correlation_id" uuid,
  "keycloak_event_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."security_event_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Auth/session security events. log_type always system. event_category in log.security_event_category lookup. Partitioned monthly.';

COMMENT ON COLUMN "log"."security_event_log"."risk_score" IS '0–100. >=80 triggers SIEM alert.';

COMMENT ON COLUMN "log"."security_event_log"."keycloak_event_id" IS 'Original KC event id for cross-system trace.';

CREATE TABLE "log"."share_audit_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "actor_id" uuid NOT NULL,
  "company_code_id" uuid,
  "target_principal_id" uuid,
  "target_group_id" uuid,
  "shared_entity_type" text NOT NULL,
  "shared_entity_id" uuid NOT NULL,
  "share_type" text NOT NULL,
  "access_level" text NOT NULL,
  "expires_at" timestamp with time zone,
  "action" text NOT NULL,
  "access_grant_id" uuid,
  "request_id" text,
  "correlation_id" uuid,
  "ip_address" inet,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."share_audit_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Canonical share/delegation audit evidence.';

CREATE TABLE "log"."workflow_event_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" shared.log_type_d DEFAULT 'business'::text NOT NULL,
  "event_type" text NOT NULL,
  "severity" text DEFAULT 'info'::text NOT NULL,
  "schema_version" smallint DEFAULT 1 NOT NULL,
  "instance_id" text NOT NULL,
  "step_instance_id" text,
  "workflow_template_code" text,
  "workflow_template_version" smallint,
  "module_code" text,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "actor_id" uuid,
  "actor_type" text,
  "actor_is_admin" boolean DEFAULT false NOT NULL,
  "from_status" text,
  "to_status" text,
  "transition_name" text,
  "action" text,
  "previous_state" jsonb,
  "new_state" jsonb,
  "comment" text,
  "attachments" jsonb,
  "detail" jsonb,
  "hash_prev" text,
  "hash_curr" text,
  "is_redacted" boolean DEFAULT false NOT NULL,
  "redaction_version" smallint,
  "key_version" smallint,
  "idempotency_key" text,
  "ip_address" inet,
  "user_agent" text,
  "correlation_id" uuid,
  "session_id" text,
  "trace_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "log"."workflow_event_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_LOG. Workflow step events and transitions. Absorbs log.workflow_transition (transition_name, from_status, to_status). Tamper-evidence via hash chain. Partitioned monthly.';

COMMENT ON COLUMN "log"."workflow_event_log"."transition_name" IS 'Populated for transition events (migrated from log.workflow_transition.transition_name).';

CREATE TABLE "log"."workspace_usage_metric" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "log_type" text GENERATED ALWAYS AS ('system'::text) STORED NOT NULL,
  "workspace_id" uuid NOT NULL,
  "metric_key" text NOT NULL,
  "metric_name" text,
  "metric_value" numeric,
  "metric_unit" text,
  "period_start" date NOT NULL,
  "period_end" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "log"."workspace_usage_metric" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Workspace usage telemetry. Feeds billing, quota enforcement, and capacity planning.';

CREATE TABLE "log"."activity_log_default"
  PARTITION OF "log"."activity_log"
  DEFAULT;

CREATE TABLE "log"."ai_call_transcript_default"
  PARTITION OF "log"."ai_call_transcript"
  DEFAULT;

CREATE TABLE "log"."attachment_access_log_default"
  PARTITION OF "log"."attachment_access_log"
  DEFAULT;

CREATE TABLE "log"."audit_log_default"
  PARTITION OF "log"."audit_log"
  DEFAULT;

CREATE TABLE "log"."auth_decision_evidence_v2_default"
  PARTITION OF "log"."auth_decision_evidence_v2"
  DEFAULT;

CREATE TABLE "log"."cycle_audit_log_default"
  PARTITION OF "log"."cycle_audit_log"
  DEFAULT;

CREATE TABLE "log"."descriptor_cache_invalidation_default"
  PARTITION OF "log"."descriptor_cache_invalidation"
  DEFAULT;

CREATE TABLE "log"."field_access_log_default"
  PARTITION OF "log"."field_access_log"
  DEFAULT;

CREATE TABLE "log"."permission_decision_log_default"
  PARTITION OF "log"."permission_decision_log"
  DEFAULT;

CREATE TABLE "log"."search_history_default"
  PARTITION OF "log"."search_history"
  DEFAULT;

CREATE TABLE "log"."security_event_log_default"
  PARTITION OF "log"."security_event_log"
  DEFAULT;

CREATE TABLE "log"."workflow_event_log_default"
  PARTITION OF "log"."workflow_event_log"
  DEFAULT;
