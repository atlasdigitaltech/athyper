-- 04_tables/006_log.sql
-- Consolidated log schema — 26 tables (down from 68 backup tables)
-- Depends on: 01_schemas, 02_types_domains, 04_tables/003_master.sql, 04_tables/002_control.sql
--
-- Column order: Identity — Table-specific — Audit (NO updated_at, NO metadata, NO status)
-- All log tables are append-only.
-- Lookup validation: extensible / shared vocabularies — control.trg_validate_lookup_columns
--                    sealed / protocol-level values   — inline CHECK
-- Partitioning:    high-volume tables — PARTITION BY RANGE (created_at)
--                  _default partition seeds; pg_partman manages monthly children
--
-- ———————————————————————————————————————————————————————————————————————————
-- | SECURITY & IDENTITY (Phase 1)                                           |
-- |   §1  audit_log                  — generic entity mutation trail        |
-- |   §2  security_event_log         — auth / session events                |
-- |   §3  permission_decision_log    — auth-engine allow/deny decisions     |
-- |   §4  field_access_log           — PII field read audit                 |
-- |   §5  password_history           — hash reuse prevention                |
-- |   §6  attachment_access_log      — file download/preview audit          |
-- |   §7  share_audit_log            — delegation / share grant audit       |
-- |                                                                         |
-- | ENTITY & WORKFLOW (Phase 2)                                             |
-- |   §8  entity_lifecycle_log       — entity state-machine transitions     |
-- |   §9  workflow_event_log         — workflow steps + transitions         |
-- |  §10  close_override_log         — close override + book close audit    |
-- |                                                                         |
-- | SYSTEM OPERATIONS (Phase 3)                                             |
-- |  §11  job_log                    — job step + run history               |
-- |  §12  policy_evaluation_log      — policy scoring decisions             |
-- |  §13  hash_anchor                — tamper-evidence chain anchors        |
-- |  §14  dimension_resolution_log   — dimension resolution trace           |
-- |                                                                         |
-- | CONSOLIDATED ACTIVITY (NEW — replaces 9 tables)                        |
-- |  §15  activity_log               — domain activity unified table        |
-- |                                                                         |
-- | FINANCE CLOSE (Phase 4)                                                 |
-- |  §16  close_activity_log         — 5 close activity tables → 1         |
-- |                                                                         |
-- | EXPORT (NEW — replaces 3 tables)                                        |
-- |  §17  export_log                 — export/download audit unified table  |
-- |                                                                         |
-- | USER ACTIVITY (Phase 5)                                                 |
-- |  §18  comment_retention_log      — compliance comment retention         |
-- |  §19  search_history             — principal search activity            |
-- |                                                                         |
-- | AI (Phase 6)                                                            |
-- |  §20  ai_inference_log           — ai_action + ai_prediction → 1       |
-- |  §21  ai_monitoring_log          — ai_drift + anomaly_baseline → 1     |
-- |  §22  ai_feedback_log            — atlas + classification feedback → 1  |
-- |  §23  ai_calibration_log         — threshold calibration history        |
-- |  §24  ai_call_transcript         — AI voice transcripts                 |
-- |                                                                         |
-- | ANALYTICS (Phase 7)                                                     |
-- |  §25  kpi_execution_log          — KPI calculation results              |
-- |  §26  workspace_usage_metric     — workspace usage telemetry            |
-- ———————————————————————————————————————————————————————————————————————————


-- ============================================================================
-- §1  audit_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.audit_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    entity_type             text        NOT NULL,
    entity_id               uuid        NOT NULL,
    operation               text        NOT NULL,
    actor_id                uuid,
    actor_type              text,
    company_code_id         uuid,
    old_values              jsonb,
    new_values              jsonb,
    changed_fields          text[],
    correlation_id          uuid,
    request_id              text,
    ip_address              inet,
    user_agent              text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT audit_log_pkey       PRIMARY KEY (id, created_at),
    CONSTRAINT audit_log_op_chk     CHECK (operation IN (
        'insert', 'update', 'delete', 'status_change',
        'bulk_insert', 'bulk_update', 'bulk_delete',
        'restore', 'archive', 'purge'
    )),
    CONSTRAINT audit_log_entity_chk CHECK (btrim(entity_type) <> '')
    -- actor_type: 09_triggers — control.trg_validate_lookup_columns('log.actor_type')
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.audit_log IS 'Generic entity mutation trail. actor_type in log.actor_type lookup. Partitioned monthly.';
COMMENT ON COLUMN log.audit_log.old_values IS 'Column snapshot before operation. NULL for inserts.';
COMMENT ON COLUMN log.audit_log.new_values IS 'Column snapshot after operation. NULL for deletes.';
COMMENT ON COLUMN log.audit_log.correlation_id IS 'Links to event.outbox id for end-to-end trace.';
CREATE TABLE IF NOT EXISTS log.audit_log_default PARTITION OF log.audit_log DEFAULT;


-- ============================================================================
-- §2  security_event_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.security_event_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    event_category          text        NOT NULL,
    event_type              text        NOT NULL,
    outcome                 text        NOT NULL,
    principal_id            uuid,
    actor_type              text,
    session_id              text,
    ip_address              inet,
    user_agent              text,
    device_fingerprint      text,
    country_code            char(2),
    mfa_method              text,
    mfa_channel             text,
    risk_score              smallint,
    risk_flags              text[],
    detail                  jsonb,
    failure_reason          text,
    correlation_id          uuid,
    keycloak_event_id       text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT sel_pkey        PRIMARY KEY (id, created_at),
    CONSTRAINT sel_outcome_chk CHECK (outcome IN ('success', 'failure', 'blocked', 'partial', 'expired')),
    CONSTRAINT sel_risk_chk    CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100)
    -- event_category: 09_triggers — control.trg_validate_lookup_columns('log.security_event_category')
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.security_event_log IS 'Auth/session security events. log_type always system. event_category in log.security_event_category lookup. Partitioned monthly.';
COMMENT ON COLUMN log.security_event_log.risk_score IS '0–100. >=80 triggers SIEM alert.';
COMMENT ON COLUMN log.security_event_log.keycloak_event_id IS 'Original KC event id for cross-system trace.';
CREATE TABLE IF NOT EXISTS log.security_event_log_default PARTITION OF log.security_event_log DEFAULT;


-- ============================================================================
-- §3  permission_decision_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.permission_decision_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    principal_id            uuid        NOT NULL,
    persona_code            text,
    permission_id           uuid,
    permission_code         text,
    feature_id              uuid,
    feature_code            text,
    entity_type             text,
    entity_id               uuid,
    module_code             text,
    decision                text        NOT NULL,
    decision_reason         text        NOT NULL,
    scope_applied           text,
    company_code_id         uuid,
    matched_grant_id        uuid,
    matched_role_id         uuid,
    matched_group_id        uuid,
    plan_gate_result        text,
    evaluation_ms           integer,
    request_id              text,
    correlation_id          uuid,
    ip_address              inet,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT pdl_pkey           PRIMARY KEY (id, created_at),
    CONSTRAINT pdl_decision_chk   CHECK (decision IN (
        'allow', 'deny', 'not_found', 'not_in_plan', 'addon_required',
        'override_denied', 'not_entitled', 'not_granted', 'module_not_subscribed'
    )),
    CONSTRAINT pdl_reason_chk     CHECK (btrim(decision_reason) <> ''),
    CONSTRAINT pdl_object_chk     CHECK (num_nonnulls(permission_id, feature_id) = 1),
    CONSTRAINT pdl_plan_gate_chk  CHECK (plan_gate_result IS NULL OR plan_gate_result IN (
        'allowed', 'not_in_plan', 'addon_required', 'override', 'skipped'
    ))
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.permission_decision_log IS 'Auth-engine allow/deny decisions. Exactly one of permission_id/feature_id per row. Partitioned monthly.';
COMMENT ON COLUMN log.permission_decision_log.evaluation_ms IS 'Auth-engine latency for performance monitoring.';
CREATE TABLE IF NOT EXISTS log.permission_decision_log_default PARTITION OF log.permission_decision_log DEFAULT;


-- ============================================================================
-- §4  field_access_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.field_access_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    principal_id            uuid        NOT NULL,
    company_code_id         uuid,
    entity_type             text        NOT NULL,
    entity_id               uuid        NOT NULL,
    field_name              text        NOT NULL,
    field_classification    text        NOT NULL,
    access_purpose          text,
    access_justification    text,
    ip_address              inet,
    user_agent              text,
    request_id              text,
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT fal_pkey         PRIMARY KEY (id, created_at),
    CONSTRAINT fal_entity_chk   CHECK (btrim(entity_type) <> ''),
    CONSTRAINT fal_field_chk    CHECK (btrim(field_name) <> '')
    -- field_classification: 09_triggers — control.trg_validate_lookup_columns('log.field_classification')
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.field_access_log IS 'PII/sensitive field read audit. field_classification in log.field_classification lookup (extensible — tenants add custom classes). Partitioned monthly.';
CREATE TABLE IF NOT EXISTS log.field_access_log_default PARTITION OF log.field_access_log DEFAULT;


-- ============================================================================
-- §5  password_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.password_history (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    principal_id            uuid        NOT NULL,
    password_hash           text        NOT NULL,
    hash_algorithm          text        NOT NULL DEFAULT 'bcrypt',
    hash_version            smallint    NOT NULL DEFAULT 1,
    change_reason           text,
    changed_by              uuid,
    ip_address              inet,
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT ph_pkey      PRIMARY KEY (id),
    CONSTRAINT ph_hash_chk  CHECK (btrim(password_hash) <> ''),
    CONSTRAINT ph_alg_chk   CHECK (hash_algorithm IN ('bcrypt', 'argon2id', 'scrypt', 'pbkdf2'))
    -- change_reason: 09_triggers — control.trg_validate_lookup_columns('log.password_change_reason')
);
COMMENT ON TABLE  log.password_history IS 'Password hash history. RLS: NO tenant read. Admin-only. change_reason in log.password_change_reason lookup.';
COMMENT ON COLUMN log.password_history.hash_version IS 'Hash parameter version — allows rotation without invalidating existing rows.';


-- ============================================================================
-- §6  attachment_access_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.attachment_access_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    principal_id            uuid        NOT NULL,
    company_code_id         uuid,
    attachment_id           uuid        NOT NULL,
    parent_entity_type      text,
    parent_entity_id        uuid,
    access_type             text        NOT NULL,
    attachment_name         text,
    attachment_size_bytes   bigint,
    attachment_mime_type    text,
    ip_address              inet,
    user_agent              text,
    request_id              text,
    correlation_id          uuid,
    outcome                 text        NOT NULL DEFAULT 'success',
    failure_reason          text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT aal_pkey         PRIMARY KEY (id, created_at),
    CONSTRAINT aal_outcome_chk  CHECK (outcome IN ('success', 'denied', 'not_found', 'error', 'watermarked'))
    -- access_type: 09_triggers — control.trg_validate_lookup_columns('log.attachment_access_type')
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.attachment_access_log IS 'Attachment download/preview audit. access_type in log.attachment_access_type lookup (extensible). Partitioned monthly.';
COMMENT ON COLUMN log.attachment_access_log.attachment_name IS 'Denormalised at access time — survives rename/delete of source attachment.';
CREATE TABLE IF NOT EXISTS log.attachment_access_log_default PARTITION OF log.attachment_access_log DEFAULT;


-- ============================================================================
-- §7  share_audit_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.share_audit_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    actor_id                uuid        NOT NULL,
    company_code_id         uuid,
    target_principal_id     uuid,
    target_group_id         uuid,
    shared_entity_type      text        NOT NULL,
    shared_entity_id        uuid        NOT NULL,
    share_type              text        NOT NULL,
    access_level            text        NOT NULL,
    expires_at              timestamptz,
    action                  text        NOT NULL,
    access_grant_id         uuid,
    request_id              text,
    correlation_id          uuid,
    ip_address              inet,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT sal_pkey         PRIMARY KEY (id),
    CONSTRAINT sal_share_chk    CHECK (share_type IN ('share_read', 'share_edit', 'delegate')),
    CONSTRAINT sal_level_chk    CHECK (access_level IN ('read', 'edit', 'full')),
    CONSTRAINT sal_action_chk   CHECK (action IN ('grant', 'revoke', 'modify', 'expire')),
    CONSTRAINT sal_target_chk   CHECK (num_nonnulls(target_principal_id, target_group_id) = 1),
    CONSTRAINT sal_entity_chk   CHECK (btrim(shared_entity_type) <> '')
);
COMMENT ON TABLE log.share_audit_log IS 'Share/delegation audit trail. Exactly one target (principal OR group). access_grant_id links to master.access_grant.';


-- ============================================================================
-- §8  entity_lifecycle_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.entity_lifecycle_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    entity_type             text        NOT NULL,
    entity_id               uuid        NOT NULL,
    lifecycle_id            uuid,
    operation_code          text,
    from_status             text,
    to_status               text        NOT NULL,
    from_state_id           uuid,
    to_state_id             uuid,
    actor_id                uuid,
    actor_type              text,
    company_code_id         uuid,
    remarks                 text,
    payload                 jsonb,
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT ell_pkey         PRIMARY KEY (id),
    CONSTRAINT ell_entity_chk   CHECK (btrim(entity_type) <> ''),
    CONSTRAINT ell_status_chk   CHECK (btrim(to_status) <> '')
);
COMMENT ON TABLE log.entity_lifecycle_log IS 'Entity state-machine transition audit. Distinct from audit_log (column mutations). Feeds state compliance reporting.';


-- ============================================================================
-- §9  workflow_event_log  (absorbs log.workflow_transition)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.workflow_event_log (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    log_type                    shared.log_type_d NOT NULL DEFAULT 'business',
    event_type                  text        NOT NULL,
    severity                    text        NOT NULL DEFAULT 'info',
    schema_version              smallint    NOT NULL DEFAULT 1,
    instance_id                 text        NOT NULL,
    step_instance_id            text,
    workflow_template_code      text,
    workflow_template_version   smallint,
    module_code                 text,
    entity_type                 text        NOT NULL,
    entity_id                   uuid        NOT NULL,
    actor_id                    uuid,
    actor_type                  text,
    actor_is_admin              boolean     NOT NULL DEFAULT false,
    -- Transition columns (absorbs log.workflow_transition)
    from_status                 text,
    to_status                   text,
    transition_name             text,
    action                      text,
    -- Payload
    previous_state              jsonb,
    new_state                   jsonb,
    comment                     text,
    attachments                 jsonb,
    detail                      jsonb,
    -- Tamper-evidence
    hash_prev                   text,
    hash_curr                   text,
    is_redacted                 boolean     NOT NULL DEFAULT false,
    redaction_version           smallint,
    key_version                 smallint,
    idempotency_key             text,
    -- Traceability
    ip_address                  inet,
    user_agent                  text,
    correlation_id              uuid,
    session_id                  text,
    trace_id                    text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    CONSTRAINT wel_pkey         PRIMARY KEY (id, created_at),
    CONSTRAINT wel_severity_chk CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    CONSTRAINT wel_hash_curr_fmt CHECK (hash_curr IS NULL OR hash_curr ~ '^[0-9a-f]{64}$'),
    CONSTRAINT wel_hash_prev_fmt CHECK (hash_prev IS NULL OR hash_prev ~ '^[0-9a-f]{64}$'),
    CONSTRAINT wel_entity_chk   CHECK (btrim(entity_type) <> '')
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.workflow_event_log IS 'Workflow step events and transitions. Absorbs log.workflow_transition (transition_name, from_status, to_status). Tamper-evidence via hash chain. Partitioned monthly.';
COMMENT ON COLUMN log.workflow_event_log.transition_name IS 'Populated for transition events (migrated from log.workflow_transition.transition_name).';
CREATE TABLE IF NOT EXISTS log.workflow_event_log_default PARTITION OF log.workflow_event_log DEFAULT;


-- ============================================================================
-- §10  close_override_log  (absorbs log.book_close_audit_log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.close_override_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    activity_type           text        NOT NULL,
    book_code               text,
    fiscal_year             smallint,
    period_number           smallint,
    override_id             uuid,
    run_id                  uuid,
    event_type              text,
    from_status             text,
    to_status               text,
    actor_id                uuid        NOT NULL,
    actor_type              text,
    company_code_id         uuid,
    reason                  text,
    evidence                jsonb,
    correlation_id          uuid,
    payload                 jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT col_pkey         PRIMARY KEY (id),
    CONSTRAINT col_activity_chk CHECK (activity_type IN ('close_override', 'book_close_audit'))
);
COMMENT ON TABLE log.close_override_log IS 'Period-close override + book close audit. activity_type=book_close_audit rows carry from_status/to_status. Absorbs log.book_close_audit_log.';


-- ============================================================================
-- §11  job_log  (absorbs completed rows from log.job_run)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.job_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    job_type                text,
    flow_id                 uuid,
    run_id                  uuid,
    step_index              smallint,
    step_type               text,
    status                  text        NOT NULL,
    input                   jsonb,
    output                  jsonb,
    error                   text,
    duration_ms             integer,
    started_at              timestamptz,
    completed_at            timestamptz,
    attempt_no              smallint    NOT NULL DEFAULT 1,
    purge_after             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT jl_pkey          PRIMARY KEY (id),
    CONSTRAINT jl_status_chk    CHECK (status IN ('success', 'failed', 'cancelled', 'timeout', 'skipped')),
    CONSTRAINT jl_duration_chk  CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT jl_attempt_chk   CHECK (attempt_no >= 1)
);
COMMENT ON TABLE log.job_log IS 'Job step + run completion history. Active jobs in event.outbox. On completion/failure: write summary here + mark outbox completed.';


-- ============================================================================
-- §12  policy_evaluation_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.policy_evaluation_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    txn_id                  uuid,
    pipeline_id             uuid,
    module_id               uuid,
    module_version          text,
    config_hash             text,
    score                   numeric(5,4),
    action                  text,
    conditions              jsonb,
    approvers               jsonb,
    sla_hours               smallint,
    explanation             text,
    confidence              numeric(5,4),
    evaluation_ms           integer,
    evaluated_at            timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT pel_pkey      PRIMARY KEY (id),
    CONSTRAINT pel_score_chk CHECK (score IS NULL OR score BETWEEN 0 AND 1),
    CONSTRAINT pel_conf_chk  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);
COMMENT ON TABLE log.policy_evaluation_log IS 'Policy engine scoring record. score and confidence are 0.0–1.0 fractions.';


-- ============================================================================
-- §13  hash_anchor
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.hash_anchor (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    anchor_date             date        NOT NULL,
    last_hash               text        NOT NULL,
    event_count             bigint      NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT ha_pkey      PRIMARY KEY (id),
    CONSTRAINT ha_date_uq   UNIQUE (tenant_id, anchor_date),
    CONSTRAINT ha_hash_chk  CHECK (btrim(last_hash) <> ''),
    CONSTRAINT ha_count_chk CHECK (event_count >= 0)
);
COMMENT ON TABLE log.hash_anchor IS 'Daily tamper-evidence anchors. One row per (tenant, anchor_date). last_hash = SHA-256 of previous anchor + all events of the day.';


-- ============================================================================
-- §14  dimension_resolution_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.dimension_resolution_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    entity_type             text,
    entity_id               uuid,
    dimension_type_id       uuid,
    resolved_value_id       uuid,
    resolution_strategy     text,
    resolution_detail       jsonb,
    is_fallback             boolean     NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT drl_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE log.dimension_resolution_log IS 'Dimension resolution trace. Records how each value was determined (direct, inherited, default, fallback).';


-- ============================================================================
-- §15  activity_log  (replaces 9 tables)
-- ============================================================================
-- Replaces: kpi_activity, pack_activity, pack_release_activity, planning_activity,
--           close_override_activity, approval_event, comment_read,
--           comment_response, recent_activity.
-- domain + activity_type — extensible lookup triggers.
-- detail jsonb absorbs all domain-specific FK columns.

CREATE TABLE IF NOT EXISTS log.activity_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    -- Discriminators — both lookup-validated (extensible)
    domain                  text        NOT NULL,
    activity_type           text        NOT NULL,
    -- Subject
    entity_type             text,
    entity_id               uuid,
    -- Actor
    actor_id                uuid,
    actor_type              text,
    company_code_id         uuid,
    -- Domain-specific FKs and data — absorbed into detail jsonb
    -- kpi   — {kpi_id, execution_id, calculation_run_id, fiscal_year, period_number}
    -- pack  — {pack_instance_id}
    -- release — {release_id}
    -- planning — {model_id, driver_id, formula_id}
    -- close — {override_id, run_id}
    -- approval — {approval_instance_id}
    -- user  — {comment_id, parent_comment_id, entity_name}
    detail                  jsonb,
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT al_pkey      PRIMARY KEY (id, created_at),
    CONSTRAINT al_dom_chk   CHECK (btrim(domain) <> ''),
    CONSTRAINT al_act_chk   CHECK (btrim(activity_type) <> '')
    -- domain:        09_triggers — control.trg_validate_lookup_columns('log.activity_domain')
    -- activity_type: 09_triggers — control.trg_validate_lookup_columns('log.activity_type')
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE  log.activity_log IS
    'Consolidated domain activity log. Replaces 9 thin tables: kpi_activity, pack_activity, '
    'pack_release_activity, planning_activity, close_override_activity, approval_event, '
    'comment_read, comment_response, recent_activity. '
    'domain + activity_type controlled via control.lookup_domain (both extensible). '
    'All domain-specific FKs live in detail jsonb.';
COMMENT ON COLUMN log.activity_log.domain IS 'Activity domain. Lookup: log.activity_domain (is_extensible=true).';
COMMENT ON COLUMN log.activity_log.activity_type IS 'Activity type within domain. Lookup: log.activity_type (is_extensible=true).';
COMMENT ON COLUMN log.activity_log.detail IS
    'Domain-specific payload. kpi={kpi_id,execution_id,calculation_run_id,fiscal_year,period_number}, '
    'pack={pack_instance_id}, release={release_id}, planning={model_id,driver_id,formula_id}, '
    'approval={approval_instance_id}, user={comment_id,parent_comment_id,entity_name}.';
CREATE TABLE IF NOT EXISTS log.activity_log_default PARTITION OF log.activity_log DEFAULT;


-- ============================================================================
-- §16  close_activity_log  (replaces 5 finance close tables)
-- ============================================================================
-- Replaces: close_automation_audit, close_task_duration_history,
--           period_close_activity, release_decision_log, remediation_preview_log.
-- activity_type — lookup trigger (non-extensible — sealed close vocabulary).
-- close_period_id FK deferred to Phase 4 (ledger schema dependency).

CREATE TABLE IF NOT EXISTS log.close_activity_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    activity_type           text        NOT NULL,
    fiscal_year             smallint,
    period_number           smallint,
    close_period_id         uuid,
    actor_id                uuid,
    actor_type              text,
    company_code_id         uuid,
    -- automation_audit — {automation_rule_id, policy_id, verdict, gate_evidence, execution_result}
    -- task_duration    — {task_id, task_code, started_at, completed_at, duration_minutes, close_type}
    -- period_close     — {close_step, step_status}
    -- release_decision — {release_id, certification_id, distribution_id, result, publication_batch_id}
    -- remediation_preview — {action_id, campaign_id, impact_summary, blocking_reasons}
    detail                  jsonb,
    outcome                 text,
    outcome_detail          text,
    correlation_id          uuid,
    payload                 jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT cal_pkey         PRIMARY KEY (id)
    -- activity_type: 09_triggers — control.trg_validate_lookup_columns('log.close_activity_type')
);
COMMENT ON TABLE  log.close_activity_log IS
    'Finance close activity log. Replaces 5 tables: close_automation_audit, '
    'close_task_duration_history, period_close_activity, release_decision_log, '
    'remediation_preview_log. activity_type in log.close_activity_type lookup. '
    'close_period_id FK added in Phase 4 once ledger.close_period exists.';
COMMENT ON COLUMN log.close_activity_log.detail IS
    'Type-specific payload. automation_audit={automation_rule_id,policy_id,verdict,gate_evidence}, '
    'task_duration={task_id,task_code,started_at,completed_at,duration_minutes}, '
    'period_close={close_step,step_status}, '
    'release_decision={release_id,certification_id,distribution_id,result}, '
    'remediation_preview={action_id,campaign_id,impact_summary,blocking_reasons}.';


-- ============================================================================
-- §17  export_log  (replaces 3 export/download tables)
-- ============================================================================
-- Replaces: release_export_log, statement_export_log, pack_download_log.
-- export_type — lookup trigger (extensible — new export types added without DDL).

CREATE TABLE IF NOT EXISTS log.export_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    export_type             text        NOT NULL,
    entity_type             text,
    entity_id               uuid,
    actor_id                uuid        NOT NULL,
    company_code_id         uuid,
    export_format           text,
    file_name               text,
    file_size_bytes         bigint,
    content_hash            text,
    hash_algorithm          text,
    ip_address              inet,
    user_agent              text,
    -- release — {release_id, certification_id, distribution_id, included_sections,
    --            release_status_at_export, is_clean_close_at_export,
    --            override_count_at_export, is_integrity_valid_at_export, export_version}
    -- statement — {instance_id, period_id, statement_type}
    -- pack_download — {distribution_id, format}
    detail                  jsonb,
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT el_pkey  PRIMARY KEY (id)
    -- export_type: 09_triggers — control.trg_validate_lookup_columns('log.export_type')
);
COMMENT ON TABLE  log.export_log IS
    'Consolidated export/download audit. Replaces: release_export_log, statement_export_log, '
    'pack_download_log. export_type in log.export_type lookup (extensible). '
    'detail carries type-specific fields.';
COMMENT ON COLUMN log.export_log.detail IS
    'release={release_id,certification_id,is_clean_close_at_export,export_version}, '
    'statement={instance_id,period_id,statement_type}, '
    'pack_download={distribution_id,format}.';


-- ============================================================================
-- §18  comment_retention_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.comment_retention_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL DEFAULT 'business',
    comment_type            text        NOT NULL,
    comment_id              uuid        NOT NULL,
    action                  text        NOT NULL,
    policy_id               uuid,
    executed_by             uuid,
    executed_at             timestamptz NOT NULL DEFAULT now(),
    comment_snapshot        jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT crl_pkey         PRIMARY KEY (id),
    CONSTRAINT crl_action_chk   CHECK (action IN ('retained', 'deleted', 'archived', 'flagged')),
    CONSTRAINT crl_type_chk     CHECK (btrim(comment_type) <> '')
);
COMMENT ON TABLE log.comment_retention_log IS 'Compliance comment retention audit. Driven by control.comment_retention_policy.';


-- ============================================================================
-- §19  search_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.search_history (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL DEFAULT 'business',
    principal_id            uuid        NOT NULL,
    query_text              text        NOT NULL,
    query_hash              text,
    entity_type             text,
    result_count            integer,
    duration_ms             integer,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT sh_pkey          PRIMARY KEY (id, created_at),
    CONSTRAINT sh_query_chk     CHECK (btrim(query_text) <> ''),
    CONSTRAINT sh_result_chk    CHECK (result_count IS NULL OR result_count >= 0)
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE log.search_history IS 'Principal search activity. query_hash enables dedup of repeated identical queries. Partitioned monthly.';
CREATE TABLE IF NOT EXISTS log.search_history_default PARTITION OF log.search_history DEFAULT;


-- ============================================================================
-- §20  ai_inference_log  (replaces ai_action + ai_prediction)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.ai_inference_log (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    log_type                    shared.log_type_d NOT NULL DEFAULT 'system',
    inference_type              text        NOT NULL,
    model_id                    uuid        NOT NULL,
    model_version               text,
    target_engine               text,
    txn_id                      uuid,
    confidence                  numeric(5,4),
    reasoning_chain             jsonb,
    input                       jsonb,
    output                      jsonb,
    -- action-specific
    action_type                 text,
    reversal_window_expires_at  timestamptz,
    reversed_at                 timestamptz,
    reversed_by                 uuid,
    -- prediction-specific
    prediction_type             text,
    is_accepted                 boolean,
    accepted_by                 uuid,
    accepted_at                 timestamptz,
    correlation_id              uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    CONSTRAINT ail_pkey     PRIMARY KEY (id),
    CONSTRAINT ail_inf_chk  CHECK (inference_type IN ('action', 'prediction')),
    CONSTRAINT ail_conf_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);
COMMENT ON TABLE log.ai_inference_log IS 'AI inference log. Replaces ai_action + ai_prediction. inference_type=action: action_type, reversal_window. inference_type=prediction: prediction_type, is_accepted.';


-- ============================================================================
-- §21  ai_monitoring_log  (replaces ai_drift_monitor + atlas_anomaly_baseline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.ai_monitoring_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'system',
    monitor_type            text        NOT NULL,
    model_id                uuid,
    entity_type             text,
    entity_id               uuid,
    metric_name             text        NOT NULL,
    metric_value            numeric,
    baseline_value          numeric,
    is_alert                boolean     NOT NULL DEFAULT false,
    is_alert_sent           boolean     NOT NULL DEFAULT false,
    window_start            timestamptz,
    window_end              timestamptz,
    -- drift — {monitoring_date}
    -- anomaly_baseline — {baseline_mean, baseline_stddev, sample_count,
    --                     window_periods, fiscal_year_from/to, period_from/to,
    --                     book_code, currency_code, expires_at}
    detail                  jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT aml_pkey         PRIMARY KEY (id),
    CONSTRAINT aml_mon_chk      CHECK (monitor_type IN ('drift', 'anomaly_baseline')),
    CONSTRAINT aml_metric_chk   CHECK (btrim(metric_name) <> '')
);
COMMENT ON TABLE log.ai_monitoring_log IS 'AI monitoring log. Replaces ai_drift_monitor + atlas_anomaly_baseline. detail carries type-specific statistical fields.';


-- ============================================================================
-- §22  ai_feedback_log  (replaces atlas_feedback + classification_feedback)
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.ai_feedback_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    feedback_type           text        NOT NULL,
    entity_type             text,
    entity_id               uuid,
    target_id               uuid,
    verdict                 text,
    reason_code             text,
    reason_detail           text,
    is_outcome_verified     boolean     NOT NULL DEFAULT false,
    outcome_notes           text,
    evidence_snapshot       jsonb,
    -- atlas — {anomaly_type, anomaly_severity, account_code, fiscal_year, period_number}
    -- classification — {class_label, confidence_before, confidence_after}
    detail                  jsonb,
    submitted_by            uuid        NOT NULL,
    submitted_at            timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT afl_pkey     PRIMARY KEY (id)
    -- feedback_type: 09_triggers — control.trg_validate_lookup_columns('log.ai_feedback_type')
);
COMMENT ON TABLE log.ai_feedback_log IS 'AI feedback log. Replaces atlas_feedback + classification_feedback. feedback_type in log.ai_feedback_type lookup.';


-- ============================================================================
-- §23  ai_calibration_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.ai_calibration_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL DEFAULT 'system',
    model_id                uuid,
    calibration_type        text,
    threshold_before        numeric,
    threshold_after         numeric,
    calibration_trigger     text,
    metric_name             text,
    metric_value            numeric,
    sample_count            integer,
    calibration_detail      jsonb,
    calibrated_by           uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT acl_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE log.ai_calibration_log IS 'AI threshold calibration history. before/after values with trigger reason for governance and rollback.';


-- ============================================================================
-- §24  ai_call_transcript
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.ai_call_transcript (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                shared.log_type_d NOT NULL DEFAULT 'business',
    session_id              text        NOT NULL,
    principal_id            uuid,
    entity_type             text,
    entity_id               uuid,
    transcript_text         text,
    transcript_engine       text,
    language_code           char(5),
    confidence              numeric(5,4),
    duration_seconds        integer,
    segments                jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT act_pkey     PRIMARY KEY (id, created_at),
    CONSTRAINT act_sess_chk CHECK (btrim(session_id) <> ''),
    CONSTRAINT act_conf_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT act_dur_chk  CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
) PARTITION BY RANGE (created_at);
COMMENT ON TABLE log.ai_call_transcript IS 'AI voice call transcripts. Reclassified from user-activity to AI domain. Partitioned monthly.';
CREATE TABLE IF NOT EXISTS log.ai_call_transcript_default PARTITION OF log.ai_call_transcript DEFAULT;


-- ============================================================================
-- §25  kpi_execution_log
-- ============================================================================
-- Stays separate from activity_log — financial columns (value, variance_amount,
-- formula_inputs) require direct SQL aggregation, not JSONB extraction.

CREATE TABLE IF NOT EXISTS log.kpi_execution_log (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL DEFAULT 'business',
    kpi_id                  uuid        NOT NULL,
    kpi_version             smallint,
    company_code_id         uuid,
    fiscal_year             smallint    NOT NULL,
    period_number           smallint    NOT NULL,
    dimension_set_id        uuid,
    book_code               text        NOT NULL DEFAULT 'STAT',
    value                   numeric(18,4) NOT NULL,
    comparison_value        numeric(18,4),
    variance_amount         numeric(18,4),
    variance_pct            numeric(8,4),
    threshold_severity      text,
    formula_inputs          jsonb,
    definition_snapshot     jsonb,
    calculation_run_id      uuid,
    execution_job_id        uuid,
    trigger_source          text,
    is_current              boolean     NOT NULL DEFAULT true,
    consumer_state          text        NOT NULL DEFAULT 'calculated',
    published_to_pack_id    uuid,
    publication_batch_id    uuid,
    correlation_id          uuid,
    period_status_at_calc   text,
    calculated_at           timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT kel_pkey             PRIMARY KEY (id),
    CONSTRAINT kel_threshold_chk    CHECK (threshold_severity IS NULL OR threshold_severity IN (
        'ok', 'info', 'warning', 'critical'
    )),
    CONSTRAINT kel_consumer_chk     CHECK (consumer_state IN (
        'calculated', 'reviewed', 'approved', 'published'
    )),
    CONSTRAINT kel_trigger_chk      CHECK (trigger_source IS NULL OR trigger_source IN (
        'manual', 'scheduler', 'period_close', 'event', 'pack_refresh'
    ))
);
COMMENT ON TABLE  log.kpi_execution_log IS 'KPI calculation results. Kept separate from activity_log — financial columns need direct SQL aggregation. is_current flags latest calculation for (kpi_id, company_code_id, fiscal_year, period).';


-- ============================================================================
-- §26  workspace_usage_metric
-- ============================================================================
CREATE TABLE IF NOT EXISTS log.workspace_usage_metric (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    log_type                text        NOT NULL
                            GENERATED ALWAYS AS ('system') STORED,
    workspace_id            uuid        NOT NULL,
    metric_key              text        NOT NULL,
    metric_name             text,
    metric_value            numeric,
    metric_unit             text,
    period_start            date        NOT NULL,
    period_end              date,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    CONSTRAINT wum_pkey         PRIMARY KEY (id),
    CONSTRAINT wum_key_chk      CHECK (btrim(metric_key) <> ''),
    CONSTRAINT wum_period_chk   CHECK (period_end IS NULL OR period_end >= period_start)
);
COMMENT ON TABLE log.workspace_usage_metric IS 'Workspace usage telemetry. Feeds billing, quota enforcement, and capacity planning.';


-- ============================================================================
-- §27  notification_delivery_attempt — HTTP request/response trace
-- ============================================================================
-- Replaces log.delivery_log.
-- Append-only with a scoped UPDATE carve-out:
--   UPDATE of is_redacted, redaction_version, purge_after is allowed
--   (credential scrubbing workflow). All other columns are immutable.
-- One row per HTTP attempt — delivery may have many attempts.

CREATE TABLE IF NOT EXISTS log.notification_delivery_attempt (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid            NOT NULL,

    -- Origin
    delivery_id     uuid,
    subscription_id uuid,

    -- Request (immutable after insert)
    request_url     text            NOT NULL,
    request_method  text            NOT NULL DEFAULT 'POST',
    request_headers jsonb,
    request_body    text,
    request_content_type text,

    -- Response (immutable after insert)
    response_status integer,
    response_headers jsonb,
    response_body   text,
    response_content_type text,

    -- Outcome (immutable after insert)
    duration_ms     integer         NOT NULL,
    is_success      boolean         NOT NULL,
    error           text,

    -- Redaction (mutable — credential scrubbing post-insert)
    is_redacted     boolean         NOT NULL DEFAULT false,
    redaction_version text,
    body_truncated  boolean         NOT NULL DEFAULT false,

    -- Retention
    purge_after     timestamptz,

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,

    CONSTRAINT nda_pkey              PRIMARY KEY (id),
    CONSTRAINT nda_url_chk           CHECK (btrim(request_url) <> ''),
    CONSTRAINT nda_method_chk        CHECK (request_method IN (
        'GET', 'POST', 'PUT', 'PATCH', 'DELETE'
    )),
    CONSTRAINT nda_duration_chk      CHECK (duration_ms >= 0),
    CONSTRAINT nda_status_chk        CHECK (
        response_status IS NULL
        OR (response_status BETWEEN 100 AND 599)
    )
);

COMMENT ON TABLE  log.notification_delivery_attempt IS
    'HTTP request/response trace per delivery attempt. Replaces log.delivery_log. '
    'Append-only: DELETE blocked. UPDATE restricted to is_redacted, '
    'redaction_version, purge_after only (credential scrubbing workflow). '
    'Enforced by 09_triggers/008_log.sql.';
COMMENT ON COLUMN log.notification_delivery_attempt.is_redacted IS
    'Set true by credential-scrubbing worker after redacting sensitive headers/body.';
COMMENT ON COLUMN log.notification_delivery_attempt.purge_after IS
    'When set, the purge job hard-deletes this row. Allows GDPR-driven retention.';


-- =============================================================================
-- §28  DOCUMENT · PRINT · BRANDING  —  log.render_dlq
-- =============================================================================
-- Dead-letter queue for permanently failed render attempts.
-- Append-focused — rows are written on failure and replayed on recovery.

CREATE TABLE IF NOT EXISTS log.render_dlq (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Source references
    output_id       uuid        NOT NULL,
    render_job_id   uuid,

    -- Error classification
    error_code      text        NOT NULL,
    error_detail    text,
    error_category  text        NOT NULL,

    -- Attempt tracking
    attempt_count   integer     NOT NULL DEFAULT 0,
    payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Replay tracking
    replayed_at     timestamptz,
    replayed_by     uuid,
    replay_count    integer     NOT NULL DEFAULT 0,
    dead_at         timestamptz NOT NULL DEFAULT now(),

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT render_dlq_pkey              PRIMARY KEY (id),
    CONSTRAINT render_dlq_category_chk      CHECK (error_category IN (
        'transient', 'permanent', 'timeout', 'crash'
    )),
    CONSTRAINT render_dlq_error_code_chk    CHECK (btrim(error_code) <> ''),
    CONSTRAINT render_dlq_attempts_pos      CHECK (attempt_count >= 0),
    CONSTRAINT render_dlq_replay_pos        CHECK (replay_count >= 0)
);

COMMENT ON TABLE log.render_dlq IS
    'Dead-letter queue for permanently failed render attempts. '
    'EXCEPTION CLASS: queue_operational — lives in log schema but is mutable '
    '(replay updates status). Has updated_at/updated_by unlike append-only log tables. '
    'Not partitioned — operational table with low row volume.';
COMMENT ON COLUMN log.render_dlq.updated_at IS
    'Set on replay (status change). Auto-populated by trg_render_dlq_updated_at.';
COMMENT ON COLUMN log.render_dlq.updated_by IS
    'Principal who triggered the replay.';


-- ============================================================================
-- §CAL  log.cycle_audit_log — governance cycle unified audit trail
-- ============================================================================
-- Append-only, partitioned by created_at. pg_partman manages monthly children.
-- Immutability enforced by RLS (no UPDATE/DELETE policies for tenant role).

CREATE TABLE IF NOT EXISTS log.cycle_audit_log (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Context
    company_code_id uuid,
    cycle_type_code varchar(30),
    domain          varchar(20) NOT NULL,
    event_type      varchar(40) NOT NULL,

    -- References
    cycle_run_id    uuid,
    target_id       uuid,
    target_type     varchar(30),

    -- Actor
    actor_id        uuid,
    actor_type      varchar(20) NOT NULL DEFAULT 'USER',

    -- State transition
    from_status     varchar(30),
    to_status       varchar(30),

    -- Payload
    payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    reason          text,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',

    CONSTRAINT cycle_audit_log_pkey PRIMARY KEY (id, created_at),
    CONSTRAINT cal_domain_chk       CHECK (domain IN ('RUN','TASK','DEVIATION','CERTIFICATION','CROSS_DEP')),
    CONSTRAINT cal_actor_chk        CHECK (actor_type IN ('USER','SYSTEM','SCHEDULER'))
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS log.cycle_audit_log_default
    PARTITION OF log.cycle_audit_log DEFAULT;

COMMENT ON TABLE log.cycle_audit_log IS
    'Unified immutable audit trail for the governance cycle model. '
    'Partitioned monthly by created_at. Append-only — no UPDATE/DELETE '
    'policies for tenant role. pg_partman manages monthly children.';
COMMENT ON COLUMN log.cycle_audit_log.created_by IS
    'Session principal who inserted this log entry. Distinct from actor_id '
    'which represents the business-domain actor (may differ for system-initiated events).';
COMMENT ON COLUMN log.cycle_audit_log.actor_id IS
    'Business-domain actor who triggered the event. May be NULL for '
    'system-initiated events (e.g. scheduler). Distinct from created_by.';

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- §14  resolution_log — unified audit trail (3 rows per txn: CONTEXT / INTENT / PROFILE)
--      Append-only: immutability trigger in 09_triggers prevents UPDATE and DELETE.
CREATE TABLE IF NOT EXISTS log.resolution_log (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    pipeline_id                 uuid        NOT NULL,
    txn_id                      uuid        NOT NULL,
    resolution_step             text        NOT NULL,

    -- Transaction context
    direction                   text        NOT NULL,
    flow_code                   text,
    company_code_id             uuid,
    doc_type                    text,
    amount                      numeric(18,4),
    currency_code               text,
    is_cross_border             boolean,
    is_intercompany             boolean,
    counterparty_type           text,

    -- Resolution result
    confidence                  numeric(3,2),
    resolution_method           text,
    explanation                 text,
    matched_rule_id             uuid,
    matched_override_id         uuid,
    rules_evaluated             smallint,
    evaluation_ms               integer,

    -- Override tracking
    was_overridden              boolean     NOT NULL DEFAULT false,
    override_by                 uuid,
    override_reason             text,
    original_resolved_id        uuid,

    -- Intent-specific (INTENT step)
    classification_source       text,
    classification_id           uuid,
    resolved_intent_id          uuid,
    resolved_domain             text,

    -- Profile-specific (PROFILE step)
    resolved_profile_config_id  uuid,
    resolved_profile_code       text,
    subledger_type              text,
    profile_type                text,
    profile_version             integer,
    event_count                 smallint,
    entry_template_count        smallint,
    book_rule_count             smallint,
    creates_commitment          boolean,
    has_paired_profile          boolean,

    -- Timing (log tables use created_at; resolved_at is domain-specific)
    resolved_at                 timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT rl_pkey           PRIMARY KEY (id),
    CONSTRAINT rl_step_chk       CHECK (resolution_step IN ('CONTEXT','INTENT','PROFILE')),
    CONSTRAINT rl_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

COMMENT ON TABLE log.resolution_log IS
    'Engine 4.13: unified resolution audit trail. '
    '3 rows per transaction: CONTEXT (input snapshot), INTENT (Step 4), PROFILE (Step 4.5). '
    'Append-only: immutability trigger prevents UPDATE and DELETE. '
    'Partial indexes in 07_indexes for step-specific queries.';


-- =============================================================================
-- §DLQ  Dead-letter queues — Phase 3.3 WorkerFramework
-- =============================================================================
-- One DLQ table per subsystem. All three share the same column set so the
-- common insertDlq() helper can target any of them.
-- Rows are inserted on job failure (after all BullMQ retries exhausted).
-- retried_at + retried_job_id populated by retryFromDlq().

-- §DLQ-1  log.audit_dlq
CREATE TABLE IF NOT EXISTS log.audit_dlq (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    queue_name          text        NOT NULL,
    job_name            text        NOT NULL,
    payload             jsonb       NOT NULL,
    error_message       text        NOT NULL,
    retry_count         smallint    NOT NULL DEFAULT 0,
    last_attempted_at   timestamptz NOT NULL,
    retried_at          timestamptz,
    retried_job_id      text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT audit_dlq_pkey       PRIMARY KEY (id),
    CONSTRAINT audit_dlq_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE log.audit_dlq IS
    'Dead-letter queue for failed audit-domain background jobs. '
    'Phase 3.3 WorkerFramework. insertDlq() target: ''log.audit_dlq''. '
    'retried_at/retried_job_id set by retryFromDlq().';

-- §DLQ-2  log.notification_dlq
CREATE TABLE IF NOT EXISTS log.notification_dlq (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    queue_name          text        NOT NULL,
    job_name            text        NOT NULL,
    payload             jsonb       NOT NULL,
    error_message       text        NOT NULL,
    retry_count         smallint    NOT NULL DEFAULT 0,
    last_attempted_at   timestamptz NOT NULL,
    retried_at          timestamptz,
    retried_job_id      text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT notification_dlq_pkey       PRIMARY KEY (id),
    CONSTRAINT notification_dlq_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE log.notification_dlq IS
    'Dead-letter queue for failed notification-domain background jobs. '
    'Phase 3.3 WorkerFramework. insertDlq() target: ''log.notification_dlq''.';

-- §DLQ-3  log.render_dlq
CREATE TABLE IF NOT EXISTS log.render_dlq (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    queue_name          text        NOT NULL,
    job_name            text        NOT NULL,
    payload             jsonb       NOT NULL,
    error_message       text        NOT NULL,
    retry_count         smallint    NOT NULL DEFAULT 0,
    last_attempted_at   timestamptz NOT NULL,
    retried_at          timestamptz,
    retried_job_id      text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT render_dlq_pkey       PRIMARY KEY (id),
    CONSTRAINT render_dlq_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE log.render_dlq IS
    'Dead-letter queue for failed render/PDF-domain background jobs. '
    'Phase 3.3 WorkerFramework. insertDlq() target: ''log.render_dlq''. '
    'PDF generation failures logged here after all BullMQ retries exhausted.';
