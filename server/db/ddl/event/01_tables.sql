-- ============================================================================
-- event/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database event schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "event"."ai_tool_invocation" (
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

COMMENT ON TABLE "event"."ai_tool_invocation" IS 'ARCHETYPE=B_LITE;SCOPE=T;DEVIATION. Durable Atlas governed-tool lifecycle ledger. Proposal identity is immutable; authorization resolves at most once; terminal outcomes are immutable and purge only with the owning thread.';

COMMENT ON COLUMN "event"."ai_tool_invocation"."input_hash" IS 'Lowercase SHA-256 of canonical validated arguments. NULL only when malformed or unavailable input cannot be safely canonicalized; raw arguments are never stored here.';

COMMENT ON COLUMN "event"."ai_tool_invocation"."permission_snapshot" IS 'Bounded proposal-time permission, entity-capability, company-scope, and field-mask decision metadata.';

COMMENT ON COLUMN "event"."ai_tool_invocation"."confirmation_token_hash" IS 'Lowercase SHA-256 of the server-signed confirmation token. The token itself is never persisted.';

COMMENT ON COLUMN "event"."ai_tool_invocation"."execution_guard_snapshot" IS 'Bounded execution-time recheck metadata for auth epoch, policy, permission, lifecycle, field scope, and row version.';

COMMENT ON COLUMN "event"."ai_tool_invocation"."evidence_refs" IS 'Opaque evidence identifiers and safe locators only; never raw evidence content.';

CREATE TABLE "event"."atlas_run" (
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

COMMENT ON TABLE "event"."atlas_run" IS 'ARCHETYPE=B_LITE;SCOPE=T;SUBTYPE=TERMINAL_IMMUTABLE. Durable Atlas run and idempotency coordinator. Contains identifiers and lifecycle metadata only; prompt/response content belongs exclusively to master.atlas_message.';

COMMENT ON COLUMN "event"."atlas_run"."client_request_id" IS 'Tenant-unique client idempotency key. Retries return the existing run and messages.';

COMMENT ON COLUMN "event"."atlas_run"."metering_run_id" IS 'Optional one-time reconciliation link to append-only log.ai_agent_run.';

CREATE TABLE "event"."authorization_global_epoch_v2" (
  "singleton_id" smallint DEFAULT 1 NOT NULL,
  "epoch" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "event"."authorization_invalidation_outbox_v2" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "idempotency_key" text NOT NULL,
  "scope_kind" text NOT NULL,
  "tenant_id" uuid,
  "plane_code" text,
  "global_epoch" bigint,
  "tenant_epoch" bigint,
  "plane_epoch" bigint,
  "epoch_applied_at" timestamp with time zone,
  "authority_schema" text NOT NULL,
  "authority_table" text NOT NULL,
  "authority_operation" character(1) NOT NULL,
  "source_row_key" jsonb NOT NULL,
  "boundary_kind" text DEFAULT 'mutation'::text NOT NULL,
  "affected_principal_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_role_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_permission_set_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_permission_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_scope_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_record_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "affected_delegation_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "cause_source_database_id" uuid,
  "cause_source_watermark" bigint,
  "cause_replay_transaction_id" uuid,
  "correlation_id" uuid,
  "effective_at" timestamp with time zone DEFAULT now() NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 12 NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "locked_until" timestamp with time zone,
  "last_error" text,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT SESSION_USER NOT NULL
);

COMMENT ON TABLE "event"."authorization_invalidation_outbox_v2" IS 'Dedicated v2 invalidation outbox. Authority identity arrays and source keys are immutable. Future effective boundaries receive their epoch only when claimed, so a scheduled grant/deny does not invalidate early.';

CREATE TABLE "event"."authorization_plane_epoch_v2" (
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "epoch" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "event"."authorization_tenant_epoch_v2" (
  "tenant_id" uuid NOT NULL,
  "epoch" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "event"."comment_flag" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "context_type" text NOT NULL,
  "comment_id" uuid NOT NULL,
  "flagged_by" uuid NOT NULL,
  "flag_reason" text NOT NULL,
  "note" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."comment_flag" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. User-submitted comment abuse report. Actionable event — demands moderation response. status lifecycle: pending — reviewed / dismissed / actioned. When actioned: governance.comment_moderation is_hidden is set true. context_type in document.comment_type. flag_reason in master.flag_reason (extensible).';

COMMENT ON COLUMN "event"."comment_flag"."review_note" IS 'Moderator decision note. Required when status = actioned.';

CREATE TABLE "event"."connector_instance" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "connector_type_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "health_status" text DEFAULT 'unknown'::text NOT NULL,
  "last_health_check_at" timestamp with time zone,
  "last_error_message" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."connector_instance" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Has both status column and manual is_active boolean; is_active not GENERATED from status. Per-tenant configured connections to external systems — instances of control.connector_type templates';

CREATE TABLE "event"."digest_staging" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "recipient_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "frequency" text NOT NULL,
  "message_id" uuid NOT NULL,
  "event_code" text NOT NULL,
  "subject" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "template_key" text NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "staged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "event"."digest_staging" IS 'ARCHETYPE=E;SCOPE=T. Pending digest items. Work queue consumed by the digest assembly worker. Rows marked delivered_at (or deleted) when batched into a digest message. channel, priority, frequency all lookup-validated. NOT a log — mutable work table.';

COMMENT ON COLUMN "event"."digest_staging"."frequency" IS 'Digest aggregation window. Lookup: notification.digest_frequency. e.g. hourly_digest, daily_digest, weekly_digest.';

CREATE TABLE "event"."document_runtime_document_version" (
  "tenant_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "document_id" uuid NOT NULL,
  "document_version" bigint DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);

COMMENT ON TABLE "event"."document_runtime_document_version" IS 'ARCHETYPE=E;SCOPE=T. Runtime-owned observable document sequence. It advances for every client-observable change, independently of legacy header/line row_version columns.';

CREATE TABLE "event"."document_runtime_event" (
  "cursor" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "document_id" uuid NOT NULL,
  "document_version" bigint NOT NULL,
  "event_type" text NOT NULL,
  "affected_node_keys" text[] DEFAULT '{}'::text[] NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "correlation_id" uuid,
  "causation_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "retained_until" timestamp with time zone NOT NULL,
  "actor_id" uuid NOT NULL
);

COMMENT ON TABLE "event"."document_runtime_event" IS 'ARCHETYPE=E;SCOPE=T;SUBTYPE=APPEND_ONLY. Canonical minimal document runtime event log. cursor is the durable replay position; payload is projected per authorized subscriber and does not replace event.outbox, which remains the cross-process delivery mechanism.';

CREATE TABLE "event"."document_runtime_idempotency" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "operation_key" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "entity_code" text NOT NULL,
  "document_id" uuid,
  "status" text DEFAULT 'in_progress'::text NOT NULL,
  "lease_expires_at" timestamp with time zone NOT NULL,
  "response_status" integer,
  "response_payload" jsonb,
  "error_code" text,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);

COMMENT ON TABLE "event"."document_runtime_idempotency" IS 'ARCHETYPE=E;SCOPE=T. Durable idempotency claim/result store for document runtime operations. The unique scope includes principal and operation; request_hash mismatch is rejected by the writer. Only expired in_progress claims are recoverable.';

CREATE TABLE "event"."document_runtime_node_version" (
  "tenant_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "document_id" uuid NOT NULL,
  "node_key" text NOT NULL,
  "node_version" bigint DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);

COMMENT ON TABLE "event"."document_runtime_node_version" IS 'ARCHETYPE=E;SCOPE=T. Durable version per compiled runtime node. The mutation orchestrator upserts affected nodes from the compiled invalidation graph in the same transaction as domain writes.';

CREATE TABLE "event"."endpoint" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "service" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "path" text NOT NULL,
  "method" text DEFAULT 'POST'::text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "health_check_url" text,
  "health" text DEFAULT 'healthy'::text NOT NULL,
  "last_checked_at" timestamp with time zone,
  "last_response_ms" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."endpoint" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Outbound integration endpoint registry. One row per named target (webhook, external API, partner endpoint). config holds adapter-specific settings; config.auth MUST be encrypted at rest. Consolidated from int schema into event schema.';

COMMENT ON COLUMN "event"."endpoint"."service" IS 'Logical service grouping (e.g. erp, payment_gateway, id_provider).';

COMMENT ON COLUMN "event"."endpoint"."config" IS 'Adapter config: base_url, headers, auth (type + credentials), timeout_ms, retry_policy. config.auth encrypted via CredentialEncryptionService.';

COMMENT ON COLUMN "event"."endpoint"."health_check_url" IS 'Optional URL probed via HTTP HEAD every 5 min by the endpoint-health worker. NULL = no automated health checking for this endpoint.';

COMMENT ON COLUMN "event"."endpoint"."health" IS 'Last known health state. Updated by the integration health-check worker. healthy | degraded | down.';

COMMENT ON COLUMN "event"."endpoint"."last_response_ms" IS 'HTTP response time (ms) from the most recent health probe. NULL if never checked.';

CREATE TABLE "event"."lifecycle_timer_schedule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_name" text NOT NULL,
  "entity_id" text NOT NULL,
  "lifecycle_id" uuid NOT NULL,
  "state_id" uuid NOT NULL,
  "timer_type" text NOT NULL,
  "transition_id" uuid,
  "scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "fire_at" timestamp with time zone NOT NULL,
  "job_id" text,
  "policy_id" uuid,
  "policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."lifecycle_timer_schedule" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Active timer work queue. One row per entity awaiting a scheduled lifecycle action. Created when entity enters a state that has a timer_policy_code in config. Cancelled when entity leaves the state before fire_at. Timer worker polls WHERE status=''scheduled'' AND fire_at <= now(). policy_snapshot: version-pinned copy of rules at schedule time. L08: failed status added. L11: entity_id=TEXT. Moved from control.* to event.* — it is an active work item, not config.';

CREATE TABLE "event"."notification_delivery" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "message_id" uuid,
  "notification_id" uuid,
  "outbox_id" uuid,
  "recipient_id" uuid,
  "recipient_addr" text NOT NULL,
  "channel" text NOT NULL,
  "provider_id" uuid,
  "provider_code" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempt_count" smallint DEFAULT 0 NOT NULL,
  "max_attempts" smallint DEFAULT 3 NOT NULL,
  "last_error" text,
  "error_category" text,
  "external_id" text,
  "idempotency_key" text,
  "subscription_id" uuid,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "clicked_at" timestamp with time zone,
  "bounced_at" timestamp with time zone,
  "next_retry_at" timestamp with time zone,
  "locked_until" timestamp with time zone,
  "channel_detail" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "event"."notification_delivery" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Per-channel delivery record. One row per (message, recipient, channel) attempt. Mutable — delivery worker updates status, attempt_count, timestamps. Absorbs: log.message_delivery (read_at added), log.sms_log (→ channel_detail), log.webhook_event completed rows. Partitioned monthly.';

COMMENT ON COLUMN "event"."notification_delivery"."subscription_id" IS 'For webhook deliveries: FK to the webhook subscription that triggered this row.';

COMMENT ON COLUMN "event"."notification_delivery"."channel_detail" IS 'Channel-specific fields not in the core schema. sms→{direction,from_number,to_number,message_ref,crm_entity_type,crm_entity_id}, webhook→{event_type,response_status,payload_hash}, email→{from_addr,reply_to,message_id_header}.';

CREATE TABLE "event"."notification_delivery_claim" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "message_id" uuid NOT NULL,
  "recipient_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."notification_delivery_claim" IS 'ARCHETYPE=E;SCOPE=T. Semantic notification delivery idempotency claim table. Workers claim (tenant_id, idempotency_key) before provider dispatch to avoid duplicate sends across retries and concurrent workers.';

COMMENT ON COLUMN "event"."notification_delivery_claim"."idempotency_key" IS 'SHA-256 delivery fingerprint for message/rule, recipient, and channel.';

CREATE TABLE "event"."notification_message" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_key" text NOT NULL,
  "event_id" text NOT NULL,
  "event_code" text NOT NULL,
  "rule_id" uuid,
  "entity_type" text,
  "entity_id" uuid,
  "template_key" text NOT NULL,
  "template_version" smallint NOT NULL,
  "subject" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "channels" text[],
  "recipient_count" integer DEFAULT 0 NOT NULL,
  "delivered_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "expires_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "correlation_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."notification_message" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Notification dispatch envelope. One row per routing_rule evaluation. status lifecycle: pending → planning → delivering → completed/partial/failed. Counters (recipient_count, delivered_count, failed_count) maintained by delivery worker. priority via notification.priority lookup.';

COMMENT ON COLUMN "event"."notification_message"."plane_key" IS 'Trusted delivery and visibility plane. Used for inbox, SSE, preference, and push isolation; not event provenance.';

COMMENT ON COLUMN "event"."notification_message"."event_id" IS 'Originating event identifier (from event.outbox.id or external event source).';

COMMENT ON COLUMN "event"."notification_message"."payload" IS 'Template variable data used to render the message body at dispatch time.';

CREATE TABLE "event"."orchestration_node" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "node_code" text NOT NULL,
  "node_type" text NOT NULL,
  "depends_on" text[] DEFAULT '{}'::text[] NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "job_id" text,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);

COMMENT ON TABLE "event"."orchestration_node" IS 'ARCHETYPE=E;SCOPE=T. One row per step within a DAG run — managed by DagOrchestrationService';

CREATE TABLE "event"."orchestration_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "dag_id" text NOT NULL,
  "trigger_type" text DEFAULT 'manual'::text NOT NULL,
  "trigger_ref" text,
  "correlation_id" text,
  "status" text DEFAULT 'running'::text NOT NULL,
  "total_nodes" integer DEFAULT 0 NOT NULL,
  "completed_nodes" integer DEFAULT 0 NOT NULL,
  "failed_nodes" integer DEFAULT 0 NOT NULL,
  "skipped_nodes" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "timeout_at" timestamp with time zone,
  "input" jsonb,
  "output" jsonb,
  "created_by" uuid
);

COMMENT ON TABLE "event"."orchestration_run" IS 'ARCHETYPE=E;SCOPE=T. One row per DAG execution — managed by DagOrchestrationService';

CREATE TABLE "event"."outbox" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "topic" text NOT NULL,
  "event_type" text,
  "event_key" text,
  "entity_type" text,
  "entity_id" uuid,
  "aggregate_id" uuid,
  "aggregate_type" text,
  "actor_id" uuid,
  "source" text,
  "correlation_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "locked_until" timestamp with time zone,
  "last_error" text,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "event"."outbox" IS 'ARCHETYPE=E;SCOPE=T. Unified transactional outbox. All event-driven consumers share this table, filtered by topic. Topics: iam (KC sync), wf (webhooks), audit (drain), fin (domain events). Workers claim batches via FOR UPDATE SKIP LOCKED on available_at.';

COMMENT ON COLUMN "event"."outbox"."topic" IS 'Consumer discriminator. Each worker polls only its topic. Convention: lowercase namespace (iam, wf, audit, fin).';

COMMENT ON COLUMN "event"."outbox"."event_type" IS 'Specific event within the topic. E.g. topic=iam, event_type=group_membership.';

COMMENT ON COLUMN "event"."outbox"."event_key" IS 'Optional idempotency/dedup key. Workers may use for exactly-once semantics.';

COMMENT ON COLUMN "event"."outbox"."available_at" IS 'Earliest time this event can be claimed. Used for retry backoff scheduling.';

COMMENT ON COLUMN "event"."outbox"."locked_by" IS 'Worker instance ID that claimed this event. NULL when not processing.';

CREATE TABLE "event"."push_subscription" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "plane_key" text NOT NULL,
  "platform" text NOT NULL,
  "device_id" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh_key" text,
  "auth_key" text,
  "device_token" text,
  "user_agent" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."push_subscription" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Web/mobile push device registry. One row per (principal, platform, device). Web Push requires VAPID keys (p256dh_key + auth_key). FCM (android) and APNs (ios) use device_token. Expired or inactive subscriptions pruned by a periodic cron.';

COMMENT ON COLUMN "event"."push_subscription"."plane_key" IS 'Trusted plane on which this device subscription was registered.';

COMMENT ON COLUMN "event"."push_subscription"."platform" IS 'Push platform discriminator: ''web'' (VAPID), ''android'' (FCM), ''ios'' (APNs).';

COMMENT ON COLUMN "event"."push_subscription"."device_id" IS 'Stable per-browser or per-device identifier used for deduplication on re-registration.';

COMMENT ON COLUMN "event"."push_subscription"."endpoint" IS 'Push service delivery URL. For Web Push this is the browser-generated URL. For FCM/APNs this is the gateway endpoint for the device_token.';

CREATE TABLE "event"."webhook_subscription" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "target_url" text NOT NULL,
  "signing_secret" text,
  "topics" text[] DEFAULT '{}'::text[] NOT NULL,
  "description" text,
  "max_retries" smallint DEFAULT 3 NOT NULL,
  "timeout_ms" integer DEFAULT 10000 NOT NULL,
  "last_delivery_at" timestamp with time zone,
  "last_delivery_status" text,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."webhook_subscription" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Per-tenant webhook subscription registry. Each row is a target URL that receives event.outbox payloads for the subscribed topics. event.notification_delivery.subscription_id references this table. Consolidated from int schema into event schema.';

COMMENT ON COLUMN "event"."webhook_subscription"."signing_secret" IS 'HMAC-SHA256 signing secret for payload signature header. Store encrypted at rest via CredentialEncryptionService. NULL = unsigned delivery.';

COMMENT ON COLUMN "event"."webhook_subscription"."topics" IS 'List of event.outbox topic values this subscription receives. Empty array = subscribe to all topics.';

CREATE TABLE "event"."whatsapp_consent" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "phone_e164" text NOT NULL,
  "consent_status" text DEFAULT 'pending'::text NOT NULL,
  "consented_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "consent_source" text,
  "waba_id" text,
  "namespace" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."whatsapp_consent" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. WhatsApp Business API opt-in registry. Tracks per-principal consent status for outbound WhatsApp messages. consent_status lifecycle: pending → opted_in → revoked. Outbound messages blocked unless consent_status = ''opted_in''. Phone numbers stored in E.164 format.';

COMMENT ON COLUMN "event"."whatsapp_consent"."phone_e164" IS 'Recipient phone number in E.164 format (e.g. +14155552671). Must match the number registered with the WhatsApp Business Account.';

COMMENT ON COLUMN "event"."whatsapp_consent"."consent_source" IS 'How consent was obtained: ''web_form'', ''api'', or ''import''.';

COMMENT ON COLUMN "event"."whatsapp_consent"."waba_id" IS 'WhatsApp Business Account ID used to send messages to this recipient. Required by Meta Cloud API for template message dispatch.';

CREATE TABLE "event"."work_item" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "task_type" text DEFAULT 'approval'::text NOT NULL,
  "workflow_request_id" uuid,
  "workflow_stage_id" uuid,
  "designated_id" uuid,
  "designated_group_id" uuid,
  "assignee_id" uuid,
  "assignee_group_id" uuid,
  "assignee_team_id" uuid,
  "order_index" smallint DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "assigned_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "decision" text,
  "reason" text,
  "due_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "event"."work_item" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Individual human task — the primitive a person acts on. task_type (lookup: work_item.task_type): approval | review | watcher. A07: designated_id = original assignment (immutable).       assignee_id  = current holder (changes on reassignment). Can exist standalone (no workflow_request_id — ad-hoc task). Watcher tasks: workflow_stage_id=NULL, status auto-completes on read. Valid decisions driven by task_type metadata in lookup_value. Renamed from event.approval_task (backup).';

COMMENT ON COLUMN "event"."work_item"."designated_id" IS 'Original assignee resolved from workflow_template_rule at task creation. Immutable after INSERT — enforced by trg_fn_wi_designation_guard. Audit trail: who was originally supposed to act on this task.';

COMMENT ON COLUMN "event"."work_item"."assignee_id" IS 'Current holder. Starts equal to designated_id. Updated on reassignment — each change logged in log.workflow_event_log. NULL when assigned to a group (assignee_group_id set) awaiting claim.';

COMMENT ON COLUMN "event"."work_item"."decision" IS 'Outcome of the work_item. Valid values per task_type: approval — approve | reject | escalate. review   — acknowledge | flag | escalate. watcher  — read. Validated by trg_fn_wi_decision_guard against task_type lookup metadata.';

CREATE TABLE "event"."notification_delivery_default"
  PARTITION OF "event"."notification_delivery"
  DEFAULT;
