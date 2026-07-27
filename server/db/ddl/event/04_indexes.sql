-- ============================================================================
-- event/04_indexes.sql
-- Concept: Event Indexes — outbox, webhook, and delivery queue performance
-- Depends on: 04_tables/007_event.sql and sub-tables
-- Naming: <table>_<cols>_idx | _pidx (partial WHERE).
-- ============================================================================

-- outbox: primary worker poll — topic + available_at for claim query
CREATE INDEX IF NOT EXISTS outbox_topic_available_pidx
    ON event.outbox (topic, available_at, created_at)
    WHERE status IN ('pending', 'failed');

-- outbox: pending count per topic (monitoring dashboards)
CREATE INDEX IF NOT EXISTS outbox_topic_status_idx
    ON event.outbox (topic, status);

-- outbox: tenant lookup (admin dashboards, per-tenant event history)
CREATE INDEX IF NOT EXISTS outbox_tenant_status_idx
    ON event.outbox (tenant_id, status);

-- Deterministic mutation keys make producer retries idempotent. NULL remains
-- available for legacy/non-deduplicated events during migration.
CREATE UNIQUE INDEX IF NOT EXISTS outbox_tenant_event_key_uq
    ON event.outbox (tenant_id, event_key)
    WHERE event_key IS NOT NULL;

-- outbox: dead letter review — topic + status for dead letter queue inspection
CREATE INDEX IF NOT EXISTS outbox_dead_letter_pidx
    ON event.outbox (topic, created_at)
    WHERE status = 'dead_letter';

-- outbox: completed event purge — processed_at for housekeeping
CREATE INDEX IF NOT EXISTS outbox_completed_purge_pidx
    ON event.outbox (processed_at)
    WHERE status = 'completed';

-- outbox: locked event timeout detection — find stale locks
CREATE INDEX IF NOT EXISTS outbox_locked_pidx
    ON event.outbox (locked_at)
    WHERE status = 'processing' AND locked_at IS NOT NULL;


-- ————————————————————————————————————————————————————————————————————————————
-- NOTIFICATION TABLES
-- ————————————————————————————————————————————————————————————————————————————

-- —— notification_message —————————————————————————————————————————————————
-- Tenant message history
CREATE INDEX IF NOT EXISTS nmsg_tenant_created_idx
    ON event.notification_message (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS nmsg_tenant_plane_created_idx
    ON event.notification_message (tenant_id, plane_key, created_at DESC);

-- Event correlation: find message from outbox event
CREATE INDEX IF NOT EXISTS nmsg_event_idx
    ON event.notification_message (tenant_id, event_code, created_at DESC);

-- Entity context: messages related to an entity
CREATE INDEX IF NOT EXISTS nmsg_entity_pidx
    ON event.notification_message (tenant_id, entity_type, entity_id)
    WHERE entity_id IS NOT NULL;

-- Stuck messages (delivering for > threshold)
CREATE INDEX IF NOT EXISTS nmsg_delivering_pidx
    ON event.notification_message (tenant_id, created_at)
    WHERE status IN ('pending', 'planning', 'delivering');

-- Outbox correlation trace
CREATE INDEX IF NOT EXISTS nmsg_correlation_pidx
    ON event.notification_message (correlation_id)
    WHERE correlation_id IS NOT NULL;

-- —— notification_delivery ———————————————————————————————————————————————
-- Primary: all deliveries for a message
CREATE INDEX IF NOT EXISTS ndlv_message_idx
    ON event.notification_delivery (tenant_id, message_id, created_at DESC);

-- Worker pickup: pending/queued rows due for retry
CREATE INDEX IF NOT EXISTS ndlv_worker_pickup_pidx
    ON event.notification_delivery (channel, next_retry_at ASC)
    WHERE status IN ('pending', 'queued');

-- Recipient delivery history
CREATE INDEX IF NOT EXISTS ndlv_recipient_idx
    ON event.notification_delivery (tenant_id, recipient_id, created_at DESC)
    WHERE recipient_id IS NOT NULL;

-- Failed delivery sweep (for alerting and retry analysis)
CREATE INDEX IF NOT EXISTS ndlv_failed_pidx
    ON event.notification_delivery (tenant_id, channel, created_at DESC)
    WHERE status IN ('failed', 'bounced');

-- External ID lookup (provider callback matching)
CREATE INDEX IF NOT EXISTS ndlv_external_id_pidx
    ON event.notification_delivery (external_id)
    WHERE external_id IS NOT NULL;

-- Webhook subscription deliveries
CREATE INDEX IF NOT EXISTS ndlv_subscription_pidx
    ON event.notification_delivery (tenant_id, subscription_id, created_at DESC)
    WHERE subscription_id IS NOT NULL;

-- Webhook outbox child rows (one durable row per outbox/subscription delivery)
CREATE INDEX IF NOT EXISTS ndlv_webhook_outbox_subscription_idx
    ON event.notification_delivery (tenant_id, outbox_id, subscription_id, created_at DESC)
    WHERE channel = 'webhook' AND outbox_id IS NOT NULL AND subscription_id IS NOT NULL;

-- Logical dedup: prevent duplicate delivery for same (message, recipient, channel)
CREATE UNIQUE INDEX IF NOT EXISTS ndlv_message_recipient_channel_uq
    ON event.notification_delivery (tenant_id, message_id, recipient_id, channel, created_at)
    WHERE status NOT IN ('cancelled');

-- Semantic delivery claims: expiry pruning and stuck-claim monitoring
CREATE INDEX IF NOT EXISTS ndcl_expiry_idx
    ON event.notification_delivery_claim (expires_at ASC);

-- —— digest_staging ——————————————————————————————————————————————————————
-- Worker pickup: pending items per recipient+channel+frequency window
CREATE INDEX IF NOT EXISTS ds_worker_pickup_idx
    ON event.digest_staging (tenant_id, recipient_id, channel, frequency, staged_at ASC)
    WHERE delivered_at IS NULL;

-- Stale items (digest never assembled — alert)
CREATE INDEX IF NOT EXISTS ds_stale_pidx
    ON event.digest_staging (staged_at ASC)
    WHERE delivered_at IS NULL;

-- —— §10  event.comment_flag ————————————————————————————————————————————
-- Moderation queue (pending flags)
CREATE INDEX IF NOT EXISTS cf_pending_idx
    ON event.comment_flag (tenant_id, created_at DESC)
    WHERE status = 'pending';
-- Flags on a specific comment
CREATE INDEX IF NOT EXISTS cf_comment_idx
    ON event.comment_flag (tenant_id, context_type, comment_id, created_at DESC);
-- Flags submitted by a principal
CREATE INDEX IF NOT EXISTS cf_flagged_by_idx
    ON event.comment_flag (tenant_id, flagged_by, created_at DESC);

-- ── control.lifecycle_hook_override ──────────────────────────────────────────
-- Active overrides for a tenant
CREATE INDEX IF NOT EXISTS lho_tenant_active_idx
    ON control.lifecycle_hook_override (tenant_id, is_active)
    WHERE is_active = true;

-- ── event.lifecycle_timer_schedule ───────────────────────────────────────────
-- Timer worker pickup: due timers
CREATE INDEX IF NOT EXISTS lts_worker_pickup_idx
    ON event.lifecycle_timer_schedule (fire_at ASC)
    WHERE status = 'scheduled';

-- Requested by principal
CREATE INDEX IF NOT EXISTS wreq_requester_idx
    ON document.workflow_request (tenant_id, requested_by, created_at DESC);

-- ── document.workflow_stage ──────────────────────────────────────────────────
-- Stages for a request ordered
CREATE INDEX IF NOT EXISTS wstg_request_ordered_idx
    ON document.workflow_stage (tenant_id, workflow_request_id, stage_no ASC);
-- Active stages needing work_item creation
CREATE INDEX IF NOT EXISTS wstg_active_pidx
    ON document.workflow_stage (tenant_id, workflow_request_id)
    WHERE status = 'active';

-- ── event.work_item ─────────────────────────────────────────────────────────
-- My work inbox (pending + assigned + in_progress)
CREATE INDEX IF NOT EXISTS wi_assignee_active_idx
    ON event.work_item (tenant_id, assignee_id, due_at ASC)
    WHERE status IN ('pending', 'assigned', 'in_progress') AND assignee_id IS NOT NULL;
-- Group inbox (unclaimed items assigned to a group)
CREATE INDEX IF NOT EXISTS wi_group_pending_idx
    ON event.work_item (tenant_id, assignee_group_id, created_at DESC)
    WHERE status IN ('pending', 'assigned') AND assignee_group_id IS NOT NULL;
-- Team inbox
CREATE INDEX IF NOT EXISTS wi_team_pending_idx
    ON event.work_item (tenant_id, assignee_team_id, created_at DESC)
    WHERE status IN ('pending', 'assigned') AND assignee_team_id IS NOT NULL;
-- SLA breach monitoring (overdue items)
CREATE INDEX IF NOT EXISTS wi_overdue_pidx
    ON event.work_item (tenant_id, due_at ASC)
    WHERE due_at IS NOT NULL AND status IN ('assigned', 'in_progress');
-- Work items for a workflow stage
CREATE INDEX IF NOT EXISTS wi_stage_idx
    ON event.work_item (tenant_id, workflow_stage_id, order_index ASC)
    WHERE workflow_stage_id IS NOT NULL;
-- Work items for a request (cross-stage view)
CREATE INDEX IF NOT EXISTS wi_request_idx
    ON event.work_item (tenant_id, workflow_request_id, created_at DESC)
    WHERE workflow_request_id IS NOT NULL;
