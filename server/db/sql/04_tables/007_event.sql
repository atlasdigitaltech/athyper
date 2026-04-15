-- 04_tables/007_event.sql
-- Depends on: 01_schemas, 02_types_domains
-- Event and integration hub schema tables.
-- Column order: Identity → Table-specific → Metadata → Lifecycle → Audit.
--
-- Tables:
--   §1  event.outbox                    — unified transactional outbox
--   §2  event.notification_message      — notification dispatch envelope
--   §3  event.notification_delivery     — per-channel delivery record (partitioned)
--   §4  event.digest_staging            — pending digest items (work queue)
--   §5  event.endpoint                  — integration endpoint registry
--   §6  event.webhook_subscription      — per-tenant webhook subscriptions
--   §7  event.comment_flag              — user-submitted abuse report
--   §8  event.lifecycle_timer_schedule  — active timer work queue
--   §9  event.work_item                 — individual human task

-- ============================================================================
-- §1  outbox — unified transactional outbox (replaces core.outbox)
-- ============================================================================
-- Single outbox table for all event-driven processing. Workers filter by topic.
-- Supports: IAM/KC sync, workflow webhooks, audit drain, finance domain events.
-- Pattern: transactional outbox with claim-based polling (FOR UPDATE SKIP LOCKED).

CREATE TABLE IF NOT EXISTS event.outbox (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (event classification)
    topic           text              NOT NULL,
    event_type      text,
    event_key       text,

    -- Table-specific (event context — optional, used by some consumers)
    entity_type     text,
    entity_id       uuid,
    aggregate_id    uuid,
    aggregate_type  text,
    actor_id        uuid,
    source          text,
    correlation_id  uuid,

    -- Table-specific (payload)
    payload         jsonb             NOT NULL DEFAULT '{}'::jsonb,

    -- Table-specific (processing state)
    status          text              NOT NULL DEFAULT 'pending',
    attempts        integer           NOT NULL DEFAULT 0,
    max_attempts    integer           NOT NULL DEFAULT 5,
    available_at    timestamptz       NOT NULL DEFAULT now(),
    locked_at       timestamptz,
    locked_by       text,
    locked_until    timestamptz,
    last_error      text,
    processed_at    timestamptz,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,

    CONSTRAINT outbox_pkey            PRIMARY KEY (id),
    CONSTRAINT outbox_topic_chk       CHECK (btrim(topic) <> ''),
    CONSTRAINT outbox_status_chk      CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'dead_letter'
    )),
    CONSTRAINT outbox_attempts_chk    CHECK (attempts >= 0),
    CONSTRAINT outbox_max_attempts_chk CHECK (max_attempts > 0),
    CONSTRAINT outbox_locked_chk      CHECK (
        (locked_at IS NULL AND locked_by IS NULL AND locked_until IS NULL)
        OR (locked_at IS NOT NULL AND locked_by IS NOT NULL AND locked_until IS NOT NULL)
    )
);

COMMENT ON TABLE event.outbox IS
  'Unified transactional outbox. All event-driven consumers share this table, '
  'filtered by topic. Topics: iam (KC sync), wf (webhooks), audit (drain), fin (domain events). '
  'Workers claim batches via FOR UPDATE SKIP LOCKED on available_at.';

COMMENT ON COLUMN event.outbox.topic IS
  'Consumer discriminator. Each worker polls only its topic. '
  'Convention: lowercase namespace (iam, wf, audit, fin).';
COMMENT ON COLUMN event.outbox.event_type IS
  'Specific event within the topic. E.g. topic=iam, event_type=group_membership.';
COMMENT ON COLUMN event.outbox.event_key IS
  'Optional idempotency/dedup key. Workers may use for exactly-once semantics.';
COMMENT ON COLUMN event.outbox.available_at IS
  'Earliest time this event can be claimed. Used for retry backoff scheduling.';
COMMENT ON COLUMN event.outbox.locked_by IS
  'Worker instance ID that claimed this event. NULL when not processing.';


-- ============================================================================
-- §2  notification_message — dispatch envelope
-- ============================================================================
-- One row per triggered routing_rule evaluation.
-- Has status lifecycle: pending → planning → delivering → completed/partial/failed.
-- Counts (recipient_count, delivered_count, failed_count) updated by delivery worker.

CREATE TABLE IF NOT EXISTS event.notification_message (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Trigger context
    event_id        text            NOT NULL,
    event_code      text            NOT NULL,
    rule_id         uuid,
    entity_type     text,
    entity_id       uuid,

    -- Template reference (snapshot at dispatch time)
    template_key    text            NOT NULL,
    template_version smallint       NOT NULL,
    subject         text,
    payload         jsonb           NOT NULL DEFAULT '{}',

    -- Dispatch config
    priority        text            NOT NULL DEFAULT 'normal',
    channels        text[],

    -- Counters (updated by delivery worker)
    recipient_count integer         NOT NULL DEFAULT 0,
    delivered_count integer         NOT NULL DEFAULT 0,
    failed_count    integer         NOT NULL DEFAULT 0,

    -- Lifecycle
    status          text            NOT NULL DEFAULT 'pending',
    expires_at      timestamptz,
    completed_at    timestamptz,

    -- Traceability
    correlation_id  uuid,
    metadata        jsonb           NOT NULL DEFAULT '{}',

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT nmsg_pkey             PRIMARY KEY (id),
    CONSTRAINT nmsg_event_chk        CHECK (btrim(event_id) <> ''),
    CONSTRAINT nmsg_template_chk     CHECK (btrim(template_key) <> ''),
    CONSTRAINT nmsg_version_chk      CHECK (template_version >= 1),
    CONSTRAINT nmsg_counts_chk       CHECK (
        recipient_count >= 0
        AND delivered_count >= 0
        AND failed_count >= 0
        AND delivered_count + failed_count <= recipient_count
    ),
    CONSTRAINT nmsg_status_chk       CHECK (status IN (
        'pending', 'planning', 'delivering', 'completed', 'partial', 'failed'
    )),
    CONSTRAINT nmsg_expiry_chk       CHECK (expires_at IS NULL OR expires_at > created_at)
    -- priority: 09_triggers — control.trg_validate_lookup_columns('notification.priority')
);

COMMENT ON TABLE  event.notification_message IS
    'Notification dispatch envelope. One row per routing_rule evaluation. '
    'status lifecycle: pending → planning → delivering → completed/partial/failed. '
    'Counters (recipient_count, delivered_count, failed_count) maintained by '
    'delivery worker. priority via notification.priority lookup.';
COMMENT ON COLUMN event.notification_message.event_id IS
    'Originating event identifier (from event.outbox.id or external event source).';
COMMENT ON COLUMN event.notification_message.payload IS
    'Template variable data used to render the message body at dispatch time.';


-- ============================================================================
-- §3  notification_delivery — per-channel delivery record
-- ============================================================================
-- One row per (message_id, recipient_id, channel) delivery attempt batch.
-- Mutable: status, attempt_count, retry timestamps updated by delivery worker.
-- Partitioned monthly — very high volume.
--
-- Absorbs:
--   log.message_delivery  → read_at column added here
--   log.sms_log           → SMS-specific fields in channel_detail jsonb
--   log.webhook_event     → completed/failed rows only (active → event.outbox)

CREATE TABLE IF NOT EXISTS event.notification_delivery (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Origin
    message_id      uuid            NOT NULL,
    notification_id uuid,

    -- Recipient
    recipient_id    uuid,
    recipient_addr  text            NOT NULL,

    -- Channel
    channel         text            NOT NULL,
    provider_id     uuid,
    provider_code   text,

    -- Delivery state (mutable — updated by delivery worker)
    status          text            NOT NULL DEFAULT 'pending',
    attempt_count   smallint        NOT NULL DEFAULT 0,
    max_attempts    smallint        NOT NULL DEFAULT 3,
    last_error      text,
    error_category  text,

    -- External tracking
    external_id     text,
    idempotency_key text,
    subscription_id uuid,

    -- Timestamps
    sent_at         timestamptz,
    delivered_at    timestamptz,
    read_at         timestamptz,
    opened_at       timestamptz,
    clicked_at      timestamptz,
    bounced_at      timestamptz,
    next_retry_at   timestamptz,
    locked_until    timestamptz,

    -- Channel-specific overflow
    -- sms     → {direction, from_number, to_number, message_ref, crm_entity_type}
    -- webhook → {event_type, response_status, payload_hash}
    -- email   → {from_addr, reply_to, headers}
    channel_detail  jsonb,

    -- Metadata
    metadata        jsonb           NOT NULL DEFAULT '{}',

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ndlv_pkey             PRIMARY KEY (id, created_at),
    CONSTRAINT ndlv_addr_chk         CHECK (btrim(recipient_addr) <> ''),
    CONSTRAINT ndlv_status_chk       CHECK (status IN (
        'pending', 'queued', 'sent', 'delivered',
        'bounced', 'failed', 'cancelled'
    )),
    CONSTRAINT ndlv_error_cat_chk    CHECK (error_category IS NULL OR error_category IN (
        'transient', 'permanent', 'rate_limit', 'auth'
    )),
    CONSTRAINT ndlv_attempts_chk     CHECK (
        attempt_count >= 0
        AND max_attempts > 0
        AND attempt_count <= max_attempts
    )
    -- channel: 09_triggers — control.trg_validate_lookup_columns('notification.channel')
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE  event.notification_delivery IS
    'Per-channel delivery record. One row per (message, recipient, channel) attempt. '
    'Mutable — delivery worker updates status, attempt_count, timestamps. '
    'Absorbs: log.message_delivery (read_at added), log.sms_log (→ channel_detail), '
    'log.webhook_event completed rows. Partitioned monthly.';
COMMENT ON COLUMN event.notification_delivery.channel_detail IS
    'Channel-specific fields not in the core schema. '
    'sms→{direction,from_number,to_number,message_ref,crm_entity_type,crm_entity_id}, '
    'webhook→{event_type,response_status,payload_hash}, '
    'email→{from_addr,reply_to,message_id_header}.';
COMMENT ON COLUMN event.notification_delivery.subscription_id IS
    'For webhook deliveries: FK to the webhook subscription that triggered this row.';

-- Monthly partitions — create ahead of time via cron or migration script:
--   CREATE TABLE event.notification_delivery_2026_04
--       PARTITION OF event.notification_delivery
--       FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- The DEFAULT partition catches any rows outside defined ranges.
CREATE TABLE IF NOT EXISTS event.notification_delivery_default
    PARTITION OF event.notification_delivery DEFAULT;


-- ============================================================================
-- §4  digest_staging — pending digest items (work queue)
-- ============================================================================
-- Work table consumed by the digest assembly worker.
-- NOT a log — rows are deleted or marked delivered_at when batched.
-- One row per pending notification per recipient per (channel, frequency) window.

CREATE TABLE IF NOT EXISTS event.digest_staging (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Target
    recipient_id    uuid            NOT NULL,
    channel         text            NOT NULL,
    frequency       text            NOT NULL,

    -- Source message
    message_id      uuid            NOT NULL,
    event_code      text            NOT NULL,
    subject         text,
    payload         jsonb           NOT NULL DEFAULT '{}',
    template_key    text            NOT NULL,
    priority        text            NOT NULL DEFAULT 'normal',

    -- Metadata
    metadata        jsonb           NOT NULL DEFAULT '{}',

    -- Lifecycle
    staged_at       timestamptz     NOT NULL DEFAULT now(),
    delivered_at    timestamptz,

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,

    CONSTRAINT ds_pkey              PRIMARY KEY (id),
    CONSTRAINT ds_event_chk         CHECK (btrim(event_code) <> ''),
    CONSTRAINT ds_template_chk      CHECK (btrim(template_key) <> '')
    -- channel:   09_triggers — control.trg_validate_lookup_columns('notification.channel')
    -- priority:  09_triggers — control.trg_validate_lookup_columns('notification.priority')
    -- frequency: 09_triggers — control.trg_validate_lookup_columns('notification.digest_frequency')
);

COMMENT ON TABLE  event.digest_staging IS
    'Pending digest items. Work queue consumed by the digest assembly worker. '
    'Rows marked delivered_at (or deleted) when batched into a digest message. '
    'channel, priority, frequency all lookup-validated. NOT a log — mutable work table.';
COMMENT ON COLUMN event.digest_staging.frequency IS
    'Digest aggregation window. Lookup: notification.digest_frequency. '
    'e.g. hourly_digest, daily_digest, weekly_digest.';


-- ============================================================================
-- §5  event.endpoint — integration endpoint registry
-- ============================================================================
-- Registered outbound integration targets. Each row is a named endpoint
-- that the platform can call (webhook target, external API, etc.).
-- Tenant-scoped: one tenant's endpoints are invisible to others.
-- config jsonb holds adapter-specific fields (base_url, headers, auth, timeout).
-- Sensitive values (API keys, secrets) must be encrypted at rest via
-- CredentialEncryptionService (Platform Migration Phase 1.7).
-- Consolidated from int.endpoint into event schema (no separate int schema).

CREATE TABLE IF NOT EXISTS event.endpoint (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Classification
    service         text        NOT NULL,
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Target
    path            text        NOT NULL,
    method          text        NOT NULL DEFAULT 'POST',

    -- Config (adapter-specific: base_url, headers, auth, timeout_ms, retry_policy)
    -- auth object MUST be encrypted via CredentialEncryptionService before storage
    config          jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Health
    health_check_url text,
    health          text        NOT NULL DEFAULT 'healthy',
    last_checked_at timestamptz,
    last_response_ms integer,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT endpoint_pkey        PRIMARY KEY (id),
    CONSTRAINT endpoint_tenant_uq   UNIQUE (tenant_id, id),
    CONSTRAINT endpoint_code_uq     UNIQUE (tenant_id, service, code),
    CONSTRAINT endpoint_method_chk  CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
    CONSTRAINT endpoint_health_chk  CHECK (health IN ('healthy','degraded','down')),
    CONSTRAINT endpoint_path_chk    CHECK (btrim(path) <> ''),
    CONSTRAINT endpoint_service_chk CHECK (btrim(service) <> ''),
    CONSTRAINT endpoint_code_chk    CHECK (btrim(code) <> '')
);

COMMENT ON TABLE  event.endpoint IS
    'Outbound integration endpoint registry. One row per named target '
    '(webhook, external API, partner endpoint). config holds adapter-specific '
    'settings; config.auth MUST be encrypted at rest. '
    'Consolidated from int schema into event schema.';
COMMENT ON COLUMN event.endpoint.service IS
    'Logical service grouping (e.g. erp, payment_gateway, id_provider).';
COMMENT ON COLUMN event.endpoint.config IS
    'Adapter config: base_url, headers, auth (type + credentials), '
    'timeout_ms, retry_policy. config.auth encrypted via CredentialEncryptionService.';
COMMENT ON COLUMN event.endpoint.health IS
    'Last known health state. Updated by the integration health-check worker. '
    'healthy | degraded | down.';
COMMENT ON COLUMN event.endpoint.health_check_url IS
    'Optional URL probed via HTTP HEAD every 5 min by the endpoint-health worker. '
    'NULL = no automated health checking for this endpoint.';
COMMENT ON COLUMN event.endpoint.last_response_ms IS
    'HTTP response time (ms) from the most recent health probe. NULL if never checked.';

-- Schema evolution — safe to run against existing databases
ALTER TABLE event.endpoint ADD COLUMN IF NOT EXISTS health_check_url  text;
ALTER TABLE event.endpoint ADD COLUMN IF NOT EXISTS last_response_ms  integer;


-- ============================================================================
-- §6  event.webhook_subscription — per-tenant webhook target registrations
-- ============================================================================
-- Subscription record for outbound webhook delivery.
-- Each row declares: which event topics to forward, to what target URL,
-- and with what signing secret.
-- event.notification_delivery rows reference subscription_id for traceability.
-- Consolidated from int.webhook_subscription into event schema (no separate int schema).

CREATE TABLE IF NOT EXISTS event.webhook_subscription (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Target
    target_url      text        NOT NULL,
    signing_secret  text,

    -- Subscription config
    topics          text[]      NOT NULL DEFAULT '{}',
    description     text,

    -- Delivery policy
    max_retries     smallint    NOT NULL DEFAULT 3,
    timeout_ms      integer     NOT NULL DEFAULT 10000,

    -- Health
    last_delivery_at     timestamptz,
    last_delivery_status text,
    failure_count        integer     NOT NULL DEFAULT 0,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ws_pkey              PRIMARY KEY (id),
    CONSTRAINT ws_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT ws_url_chk           CHECK (btrim(target_url) <> ''),
    CONSTRAINT ws_timeout_chk       CHECK (timeout_ms > 0),
    CONSTRAINT ws_retries_chk       CHECK (max_retries >= 0),
    CONSTRAINT ws_failure_chk       CHECK (failure_count >= 0)
);

COMMENT ON TABLE  event.webhook_subscription IS
    'Per-tenant webhook subscription registry. Each row is a target URL '
    'that receives event.outbox payloads for the subscribed topics. '
    'event.notification_delivery.subscription_id references this table. '
    'Consolidated from int schema into event schema.';
COMMENT ON COLUMN event.webhook_subscription.signing_secret IS
    'HMAC-SHA256 signing secret for payload signature header. '
    'Store encrypted at rest via CredentialEncryptionService. NULL = unsigned delivery.';
COMMENT ON COLUMN event.webhook_subscription.topics IS
    'List of event.outbox topic values this subscription receives. '
    'Empty array = subscribe to all topics.';


-- ============================================================================
-- §7  event.comment_flag — user-submitted abuse report
-- ============================================================================
CREATE TABLE IF NOT EXISTS event.comment_flag (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Subject (which comment was flagged)
    context_type    text        NOT NULL,
    comment_id      uuid        NOT NULL,

    -- Report
    flagged_by      uuid        NOT NULL,
    flag_reason     text        NOT NULL,
    note            text,

    -- Moderation response (mutable)
    status          text        NOT NULL DEFAULT 'pending',
    reviewed_by     uuid,
    reviewed_at     timestamptz,
    review_note     text,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT cf_pkey          PRIMARY KEY (id),
    CONSTRAINT cf_status_chk    CHECK (status IN (
        'pending', 'reviewed', 'dismissed', 'actioned'
    )),
    CONSTRAINT cf_review_chk    CHECK (
        (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
        OR (status IN ('reviewed','dismissed','actioned')
            AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    ),
    -- review_note is required when actioned (moderator must explain decision)
    CONSTRAINT cf_actioned_note_chk CHECK (
        status <> 'actioned' OR review_note IS NOT NULL
    )
    -- context_type: 09_triggers — control.trg_validate_lookup_columns('master.comment_type')
    -- flag_reason:  09_triggers — control.trg_validate_lookup_columns('master.flag_reason')
);

COMMENT ON TABLE  event.comment_flag IS
    'User-submitted comment abuse report. Actionable event — demands moderation response. '
    'status lifecycle: pending — reviewed / dismissed / actioned. '
    'When actioned: governance.comment_moderation is_hidden is set true. '
    'context_type in master.comment_type. flag_reason in master.flag_reason (extensible).';
COMMENT ON COLUMN event.comment_flag.review_note IS
    'Moderator decision note. Required when status = actioned.';


-- =============================================================================
-- §8  event.lifecycle_timer_schedule — active timer work queue
-- =============================================================================
-- One row per scheduled timer event for an entity in a state.
-- Moved from control.* (backup) to event.* — it is an actionable work item.
-- L08: 'failed' status added.
-- L11: entity_id is TEXT (polymorphic — not always uuid).
-- policy_snapshot captures rules at schedule time (version-pinned).

CREATE TABLE IF NOT EXISTS event.lifecycle_timer_schedule (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Subject (L11: entity_id = TEXT to match entity_lifecycle_instance)
    entity_name     text        NOT NULL,
    entity_id       text        NOT NULL,
    lifecycle_id    uuid        NOT NULL,
    state_id        uuid        NOT NULL,

    -- Timer definition
    timer_type      text        NOT NULL,
    transition_id   uuid,

    -- Schedule
    scheduled_at    timestamptz NOT NULL DEFAULT now(),
    fire_at         timestamptz NOT NULL,

    -- Execution
    job_id          text,
    policy_id       uuid,
    -- Version-pinned rules at schedule creation time
    policy_snapshot jsonb       NOT NULL DEFAULT '{}',

    -- Status (L08: 'failed' added)
    status          text        NOT NULL DEFAULT 'scheduled',

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT lts_pkey             PRIMARY KEY (id),
    CONSTRAINT lts_timer_type_chk   CHECK (timer_type IN (
        'auto_close', 'auto_cancel', 'reminder', 'auto_transition'
    )),
    -- L08: 'failed' added
    CONSTRAINT lts_status_chk       CHECK (status IN (
        'scheduled', 'fired', 'cancelled', 'failed'
    )),
    CONSTRAINT lts_fire_after_chk   CHECK (fire_at >= scheduled_at),
    CONSTRAINT lts_entity_chk       CHECK (btrim(entity_name) <> '' AND btrim(entity_id) <> ''),
    CONSTRAINT lts_snapshot_chk     CHECK (jsonb_typeof(policy_snapshot) = 'object')
);

COMMENT ON TABLE  event.lifecycle_timer_schedule IS
    'Active timer work queue. One row per entity awaiting a scheduled lifecycle action. '
    'Created when entity enters a state that has a timer_policy_code in config. '
    'Cancelled when entity leaves the state before fire_at. '
    'Timer worker polls WHERE status=''scheduled'' AND fire_at <= now(). '
    'policy_snapshot: version-pinned copy of rules at schedule time. '
    'L08: failed status added. L11: entity_id=TEXT. '
    'Moved from control.* to event.* — it is an active work item, not config.';


-- =============================================================================
-- §9  event.work_item — individual human task
-- =============================================================================
-- One row per human task within a workflow. The primitive that a person
-- actually sees in their inbox and acts upon.
-- task_type discriminates: approval / review / watcher (lookup-validated).
-- A07: designated_id (who was originally assigned) is immutable after creation.
--       assignee_id  (who currently holds it) changes on reassignment.
-- work_item can exist without a workflow_stage (standalone watcher, ad-hoc review).
-- Renamed from event.approval_task (backup).

CREATE TABLE IF NOT EXISTS event.work_item (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Task classification (lookup: work_item.task_type)
    task_type               text        NOT NULL DEFAULT 'approval',

    -- Parent references (both nullable — standalone work_items allowed)
    workflow_request_id     uuid,
    workflow_stage_id       uuid,

    -- Original assignment (A07: immutable after INSERT)
    designated_id           uuid,           -- resolved from workflow_template_rule
    designated_group_id     uuid,           -- group assignment (any member can claim)

    -- Current assignment (A07: updated on reassignment)
    assignee_id             uuid,
    assignee_group_id       uuid,
    assignee_team_id        uuid,

    -- Execution ordering (within serial-mode stage)
    order_index             smallint    NOT NULL DEFAULT 1,

    -- Task lifecycle
    status                  text        NOT NULL DEFAULT 'pending',
    assigned_at             timestamptz,
    started_at              timestamptz,
    completed_at            timestamptz,

    -- Decision (valid values driven by task_type metadata in lookup)
    -- approval:  approve | reject | escalate
    -- review:    acknowledge | flag | escalate
    -- watcher:   read
    decision                text,
    reason                  text,

    -- SLA
    due_at                  timestamptz,

    -- Metadata (IP, device, comment_id, etc.)
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT wi_pkey                  PRIMARY KEY (id),
    CONSTRAINT wi_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT wi_order_chk             CHECK (order_index >= 1),
    CONSTRAINT wi_status_chk            CHECK (status IN (
        'pending', 'assigned', 'in_progress', 'completed', 'skipped', 'escalated'
    )),
    -- A11: due_at must be in the future relative to creation
    CONSTRAINT wi_due_at_chk            CHECK (
        due_at IS NULL OR due_at > created_at
    ),
    -- Completed tasks must have completed_at
    CONSTRAINT wi_completed_chk         CHECK (
        status NOT IN ('completed', 'skipped', 'escalated')
        OR completed_at IS NOT NULL
    ),
    -- A07: assignee or group required when not pending
    CONSTRAINT wi_assignee_chk          CHECK (
        status = 'pending'
        OR assignee_id IS NOT NULL
        OR assignee_group_id IS NOT NULL
        OR assignee_team_id IS NOT NULL
    ),
    -- Exactly one of: stage-linked or standalone
    CONSTRAINT wi_request_stage_chk     CHECK (
        (workflow_request_id IS NOT NULL AND workflow_stage_id IS NOT NULL)  -- stage-linked
        OR (workflow_request_id IS NOT NULL AND workflow_stage_id IS NULL)   -- request-linked watcher
        OR (workflow_request_id IS NULL AND workflow_stage_id IS NULL)       -- fully standalone
    ),
    CONSTRAINT wi_metadata_chk          CHECK (jsonb_typeof(metadata) = 'object')
    -- task_type: 09_triggers — control.trg_validate_lookup_columns('work_item.task_type')
);

COMMENT ON TABLE  event.work_item IS
    'Individual human task — the primitive a person acts on. '
    'task_type (lookup: work_item.task_type): approval | review | watcher. '
    'A07: designated_id = original assignment (immutable). '
    '      assignee_id  = current holder (changes on reassignment). '
    'Can exist standalone (no workflow_request_id — ad-hoc task). '
    'Watcher tasks: workflow_stage_id=NULL, status auto-completes on read. '
    'Valid decisions driven by task_type metadata in lookup_value. '
    'Renamed from event.approval_task (backup).';
COMMENT ON COLUMN event.work_item.designated_id IS
    'Original assignee resolved from workflow_template_rule at task creation. '
    'Immutable after INSERT — enforced by trg_fn_wi_designation_guard. '
    'Audit trail: who was originally supposed to act on this task.';
COMMENT ON COLUMN event.work_item.assignee_id IS
    'Current holder. Starts equal to designated_id. '
    'Updated on reassignment — each change logged in log.workflow_event_log. '
    'NULL when assigned to a group (assignee_group_id set) awaiting claim.';
COMMENT ON COLUMN event.work_item.decision IS
    'Outcome of the work_item. Valid values per task_type: '
    'approval — approve | reject | escalate. '
    'review   — acknowledge | flag | escalate. '
    'watcher  — read. '
    'Validated by trg_fn_wi_decision_guard against task_type lookup metadata.';


-- ============================================================================
-- §10  event.push_subscription — web/mobile push device registry
-- ============================================================================
-- One row per (principal, platform, device). Tracks the endpoint and keys
-- required to deliver push notifications via VAPID (Web Push) or FCM/APNs.
-- Expired or inactive subscriptions pruned by cron.

CREATE TABLE IF NOT EXISTS event.push_subscription (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,
    principal_id    uuid            NOT NULL,

    -- Subscription identity
    platform        text            NOT NULL,   -- 'web', 'android', 'ios'
    device_id       text            NOT NULL,   -- browser fingerprint or OS device ID
    endpoint        text            NOT NULL,   -- push service URL (FCM / APNs / Web Push)

    -- Web Push VAPID keys (required when platform = 'web')
    p256dh_key      text,                       -- client public key
    auth_key        text,                       -- client auth secret

    -- FCM / APNs token (required when platform IN ('android', 'ios'))
    device_token    text,

    -- Optional metadata
    user_agent      text,
    metadata        jsonb           NOT NULL DEFAULT '{}',

    -- Lifecycle
    is_active       boolean         NOT NULL DEFAULT true,
    last_used_at    timestamptz,
    expires_at      timestamptz,

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ps_pkey              PRIMARY KEY (id),
    CONSTRAINT ps_tenant_uq         UNIQUE (tenant_id, id),
    CONSTRAINT ps_device_uq         UNIQUE (tenant_id, principal_id, platform, device_id),
    CONSTRAINT ps_endpoint_chk      CHECK  (btrim(endpoint) <> ''),
    CONSTRAINT ps_platform_chk      CHECK  (platform IN ('web', 'android', 'ios')),
    CONSTRAINT ps_web_keys_chk      CHECK  (
        platform <> 'web'
        OR (p256dh_key IS NOT NULL AND auth_key IS NOT NULL)
    ),
    CONSTRAINT ps_mobile_token_chk  CHECK  (
        platform = 'web'
        OR device_token IS NOT NULL
    )
);

COMMENT ON TABLE event.push_subscription IS
    'Web/mobile push device registry. One row per (principal, platform, device). '
    'Web Push requires VAPID keys (p256dh_key + auth_key). '
    'FCM (android) and APNs (ios) use device_token. '
    'Expired or inactive subscriptions pruned by a periodic cron.';

COMMENT ON COLUMN event.push_subscription.platform IS
    'Push platform discriminator: ''web'' (VAPID), ''android'' (FCM), ''ios'' (APNs).';
COMMENT ON COLUMN event.push_subscription.device_id IS
    'Stable per-browser or per-device identifier used for deduplication on re-registration.';
COMMENT ON COLUMN event.push_subscription.endpoint IS
    'Push service delivery URL. For Web Push this is the browser-generated URL. '
    'For FCM/APNs this is the gateway endpoint for the device_token.';

CREATE INDEX IF NOT EXISTS ps_principal_active_idx
    ON event.push_subscription (tenant_id, principal_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ps_expired_pidx
    ON event.push_subscription (expires_at)
    WHERE is_active = true AND expires_at IS NOT NULL;


-- ============================================================================
-- §11  event.whatsapp_consent — WhatsApp Business API opt-in registry
-- ============================================================================
-- Tracks per-principal consent for outbound WhatsApp Business API messages.
-- consent_status lifecycle: pending → opted_in → opted_out / revoked.
-- Outbound WhatsApp messages are blocked unless consent_status = 'opted_in'.
-- Phone numbers stored in E.164 format (+[country][number]).

CREATE TABLE IF NOT EXISTS event.whatsapp_consent (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,
    principal_id    uuid            NOT NULL,

    -- Phone number (E.164)
    phone_e164      text            NOT NULL,

    -- Consent state
    consent_status  text            NOT NULL DEFAULT 'pending',
    consented_at    timestamptz,
    revoked_at      timestamptz,
    consent_source  text,           -- 'web_form', 'api', 'import'

    -- WhatsApp Business Account linkage
    waba_id         text,           -- WhatsApp Business Account ID
    namespace       text,           -- Template namespace for this tenant

    -- Optional metadata
    metadata        jsonb           NOT NULL DEFAULT '{}',

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT wac_pkey             PRIMARY KEY (id),
    CONSTRAINT wac_tenant_uq        UNIQUE (tenant_id, id),
    CONSTRAINT wac_phone_uq         UNIQUE (tenant_id, principal_id, phone_e164),
    CONSTRAINT wac_phone_chk        CHECK  (phone_e164 ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT wac_status_chk       CHECK  (consent_status IN (
        'pending', 'opted_in', 'opted_out', 'revoked'
    )),
    CONSTRAINT wac_consent_chk      CHECK  (
        (consent_status = 'opted_in' AND consented_at IS NOT NULL)
        OR consent_status <> 'opted_in'
    ),
    CONSTRAINT wac_revoke_chk       CHECK  (
        (consent_status = 'revoked' AND revoked_at IS NOT NULL)
        OR consent_status <> 'revoked'
    )
);

COMMENT ON TABLE event.whatsapp_consent IS
    'WhatsApp Business API opt-in registry. Tracks per-principal consent status for '
    'outbound WhatsApp messages. consent_status lifecycle: pending → opted_in → revoked. '
    'Outbound messages blocked unless consent_status = ''opted_in''. '
    'Phone numbers stored in E.164 format.';

COMMENT ON COLUMN event.whatsapp_consent.phone_e164 IS
    'Recipient phone number in E.164 format (e.g. +14155552671). '
    'Must match the number registered with the WhatsApp Business Account.';
COMMENT ON COLUMN event.whatsapp_consent.consent_source IS
    'How consent was obtained: ''web_form'', ''api'', or ''import''.';
COMMENT ON COLUMN event.whatsapp_consent.waba_id IS
    'WhatsApp Business Account ID used to send messages to this recipient. '
    'Required by Meta Cloud API for template message dispatch.';

CREATE INDEX IF NOT EXISTS wac_principal_active_idx
    ON event.whatsapp_consent (tenant_id, principal_id)
    WHERE consent_status = 'opted_in';

CREATE INDEX IF NOT EXISTS wac_phone_lookup_idx
    ON event.whatsapp_consent (tenant_id, phone_e164)
    WHERE consent_status = 'opted_in';
