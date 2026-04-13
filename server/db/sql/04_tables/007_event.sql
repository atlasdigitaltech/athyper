-- 04_tables/007_event.sql
-- Depends on: 01_schemas, 02_types_domains
-- Event schema tables. Column order: Identity → Table-specific → Metadata → Lifecycle → Audit.

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
        (locked_at IS NULL AND locked_by IS NULL)
        OR (locked_at IS NOT NULL AND locked_by IS NOT NULL)
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
-- §10  event.comment_flag — user-submitted abuse report
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
-- §9  event.lifecycle_timer_schedule — active timer work queue
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
-- §8  event.work_item — individual human task
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
