-- Plane-local, append-only audit evidence. The same contract is installed in
-- Athyper, Neon, and Mesh; rows never cross database boundaries.

-- The controlled "why" catalog is business-visible master configuration while
-- its sealed vocabulary and only consumer belong to the audit domain.
CREATE TABLE master.audit_reason_code (
    id                  uuid                     NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                     NOT NULL,
    code                text                     NOT NULL,
    name                text                     NOT NULL,
    description         text,
    category            audit.reason_category_d NOT NULL,
    severity            audit.reason_severity_d NOT NULL DEFAULT 'normal',
    requires_comment    boolean                  NOT NULL DEFAULT false,
    origin              audit.reason_origin_d   NOT NULL DEFAULT 'tenant',
    sort_order          smallint                 NOT NULL DEFAULT 100,
    metadata            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    status              audit.reason_status_d   NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz              NOT NULL DEFAULT now(),
    created_by          uuid                     NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT audit_reason_code_pkey PRIMARY KEY (id),
    CONSTRAINT audit_reason_code_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT audit_reason_code_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT audit_reason_code_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT audit_reason_code_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT audit_reason_code_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT audit_reason_code_sort_order_chk CHECK (sort_order >= 0),
    CONSTRAINT audit_reason_code_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT audit_reason_code_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT audit_reason_code_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.audit_reason_code IS
  'Tenant-controlled why catalog referenced by audit.audit_log. Event identity remains audit.audit_log.event_code.';
COMMENT ON COLUMN master.audit_reason_code.requires_comment IS
  'Requires a case-specific audit.audit_log.reason_comment when this reason is selected.';

CREATE TABLE master.audit_event_contract (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                  text        NOT NULL,
    event_code_pattern    text        NOT NULL,
    priority              smallint    NOT NULL DEFAULT 100,
    allowed_operations    audit.operation_d[] NOT NULL,
    default_severity      audit.event_severity_d NOT NULL DEFAULT 'info',
    allowed_actor_types   audit.actor_type_d[] NOT NULL,
    allowed_scope         audit.event_scope_d NOT NULL DEFAULT 'tenant',
    reason_required       boolean     NOT NULL DEFAULT false,
    capture_mode          audit.capture_mode_d NOT NULL DEFAULT 'metadata',
    max_payload_bytes     integer     NOT NULL DEFAULT 65536,
    schema_version        integer     NOT NULL DEFAULT 1,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                audit.reason_status_d NOT NULL DEFAULT 'active',
    created_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT audit_event_contract_pkey PRIMARY KEY(id),
    CONSTRAINT audit_event_contract_code_uq UNIQUE(code),
    CONSTRAINT audit_event_contract_priority_uq UNIQUE(priority,code),
    CONSTRAINT audit_event_contract_code_chk CHECK(code~'^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT audit_event_contract_pattern_chk CHECK(btrim(event_code_pattern)<>''),
    CONSTRAINT audit_event_contract_operation_chk CHECK(
        cardinality(allowed_operations)>0 AND array_position(allowed_operations,NULL) IS NULL
    ),
    CONSTRAINT audit_event_contract_actor_chk CHECK(
        cardinality(allowed_actor_types)>0 AND array_position(allowed_actor_types,NULL) IS NULL
    ),
    CONSTRAINT audit_event_contract_payload_chk CHECK(max_payload_bytes BETWEEN 1024 AND 1048576),
    CONSTRAINT audit_event_contract_version_chk CHECK(schema_version>0),
    CONSTRAINT audit_event_contract_metadata_chk CHECK(jsonb_typeof(metadata)='object')
);

COMMENT ON TABLE master.audit_event_contract IS
  'Sealed, plane-local audit event-pattern contract. It controls operation, actor, scope, capture mode, and payload bounds without conflating event identity with tenant reason codes.';

CREATE TABLE audit.audit_log (
    id                          uuid               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    plane_code                 audit.plane_code_d NOT NULL
        DEFAULT current_setting('app.database_plane')::audit.plane_code_d,
    event_code                  text               NOT NULL,
    event_contract_code         text               NOT NULL,
    event_schema_version        integer            NOT NULL DEFAULT 1,
    operation                   audit.operation_d  NOT NULL,
    outcome                     audit.outcome_d     NOT NULL DEFAULT 'success',
    severity                    audit.event_severity_d NOT NULL DEFAULT 'info',
    entity_type                 text               NOT NULL,
    entity_id                   uuid,
    scope_type                  text,
    scope_id                    uuid,
    actor_principal_id          uuid,
    actor_type                  audit.actor_type_d NOT NULL,
    audit_reason_code_id        uuid,
    audit_reason_code_snapshot  text,
    reason_comment              text,
    old_values                  jsonb,
    new_values                  jsonb,
    changed_fields              text[],
    context                     jsonb              NOT NULL DEFAULT '{}'::jsonb,
    source_service              text               NOT NULL DEFAULT
        coalesce(nullif(current_setting('application_name', true), ''), 'unknown'),
    trace_id                    char(32),
    span_id                     char(16),
    correlation_id              uuid,
    request_id                  text,
    ip_address                  inet,
    user_agent                  text,
    occurred_at                 timestamptz        NOT NULL DEFAULT now(),
    -- Evidence may be appended late in a long-running transaction. Use wall
    -- clock time so recorded_at cannot precede a default clock_timestamp()
    -- occurred_at value merely because now() is transaction-stable.
    recorded_at                 timestamptz        NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT audit_log_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT audit_log_event_code_chk CHECK (
        event_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'
    ),
    CONSTRAINT audit_log_event_contract_chk CHECK (
        event_contract_code~'^[a-z][a-z0-9_.-]{1,126}$' AND event_schema_version>0
    ),
    CONSTRAINT audit_log_entity_type_chk CHECK (
        entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT audit_log_scope_pair_chk
        CHECK ((scope_type IS NULL) = (scope_id IS NULL)),
    CONSTRAINT audit_log_scope_type_chk CHECK (
        scope_type IS NULL
        OR scope_type ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT audit_log_entity_scope_chk CHECK (
        tenant_id IS NOT NULL
        OR scope_type = 'platform'
    ),
    CONSTRAINT audit_log_actor_chk CHECK (
        (actor_type IN ('system', 'anonymous') AND actor_principal_id IS NULL)
        OR
        (actor_type NOT IN ('system', 'anonymous') AND actor_principal_id IS NOT NULL)
    ),
    CONSTRAINT audit_log_reason_pair_chk CHECK (
        (audit_reason_code_id IS NULL) =
        (audit_reason_code_snapshot IS NULL)
    ),
    CONSTRAINT audit_log_reason_code_snapshot_chk CHECK (
        audit_reason_code_snapshot IS NULL
        OR audit_reason_code_snapshot ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT audit_log_reason_comment_chk CHECK (
        reason_comment IS NULL
        OR (
            audit_reason_code_id IS NOT NULL
            AND btrim(reason_comment) <> ''
            AND length(reason_comment) <= 2000
        )
    ),
    CONSTRAINT audit_log_values_chk CHECK (
        (old_values IS NULL OR jsonb_typeof(old_values) = 'object')
        AND (new_values IS NULL OR jsonb_typeof(new_values) = 'object')
    ),
    CONSTRAINT audit_log_changed_fields_chk CHECK (
        changed_fields IS NULL
        OR array_position(changed_fields, NULL) IS NULL
    ),
    CONSTRAINT audit_log_context_object_chk
        CHECK (jsonb_typeof(context) = 'object'),
    CONSTRAINT audit_log_source_service_chk CHECK (
        btrim(source_service) <> ''
        AND length(source_service) <= 128
    ),
    CONSTRAINT audit_log_trace_id_chk CHECK (
        trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'
    ),
    CONSTRAINT audit_log_span_id_chk CHECK (
        span_id IS NULL OR span_id ~ '^[0-9a-f]{16}$'
    ),
    CONSTRAINT audit_log_trace_pair_chk CHECK (
        (trace_id IS NULL) = (span_id IS NULL)
    ),
    CONSTRAINT audit_log_request_id_chk CHECK (
        request_id IS NULL
        OR (btrim(request_id) <> '' AND length(request_id) <= 256)
    ),
    CONSTRAINT audit_log_user_agent_chk CHECK (
        user_agent IS NULL OR length(user_agent) <= 2048
    ),
    CONSTRAINT audit_log_time_chk CHECK (recorded_at >= occurred_at)
)
PARTITION BY RANGE (occurred_at);

CREATE TABLE audit.audit_log_default
    PARTITION OF audit.audit_log DEFAULT;

COMMENT ON TABLE audit.audit_log IS
  'Append-only tenant audit evidence. event_code records what happened; audit_reason_code records why; reason_comment captures case-specific explanation.';
COMMENT ON COLUMN audit.audit_log.event_code IS
  'Stable namespaced machine identifier such as accounting.gl_account.overridden or document.snapshot.restored.';
COMMENT ON COLUMN audit.audit_log.audit_reason_code_snapshot IS
  'Immutable code copied from master.audit_reason_code at insert time for durable reporting.';
COMMENT ON COLUMN audit.audit_log.reason_comment IS
  'Optional case-specific explanation. Required when the selected reason catalog row declares requires_comment.';
COMMENT ON COLUMN audit.audit_log.context IS
  'Non-authoritative structured context such as source document, workflow, job, or integration coordinates.';
COMMENT ON COLUMN audit.audit_log.trace_id IS
  'W3C trace identifier shared with structured Loki events and Tempo traces.';
COMMENT ON COLUMN audit.audit_log.span_id IS
  'W3C span identifier shared with structured Loki events and Tempo traces.';

-- High-volume, strongly typed authorization evidence remains separate from
-- the general audit envelope so decision latency and policy reports do not
-- require JSON scans.
CREATE TABLE audit.authorization_decision_evidence (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    plane_code               audit.plane_code_d NOT NULL
        DEFAULT current_setting('app.database_plane')::audit.plane_code_d,
    decision                 audit.authorization_decision_d NOT NULL,
    subject_principal_id     uuid,
    subject_type             audit.actor_type_d NOT NULL,
    subject_ref              text,
    permission_code          text          NOT NULL,
    action                   text          NOT NULL,
    resource_type            text          NOT NULL,
    resource_id              text,
    policy_code              text,
    policy_version           text,
    reason_codes             text[]        NOT NULL DEFAULT '{}',
    evaluation_duration_ms   integer       NOT NULL,
    cache_hit                boolean       NOT NULL DEFAULT false,
    source_service           text          NOT NULL DEFAULT
        coalesce(nullif(current_setting('application_name', true), ''), 'unknown'),
    trace_id                 char(32),
    span_id                  char(16),
    correlation_id           uuid,
    request_id               text,
    context                  jsonb         NOT NULL DEFAULT '{}'::jsonb,
    occurred_at              timestamptz   NOT NULL DEFAULT now(),
    recorded_at              timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT authorization_decision_evidence_pkey
        PRIMARY KEY (occurred_at, id),
    CONSTRAINT authorization_decision_subject_chk CHECK (
        (subject_type IN ('system', 'anonymous')
            AND subject_principal_id IS NULL)
        OR
        (subject_type NOT IN ('system', 'anonymous')
            AND (subject_principal_id IS NOT NULL OR subject_ref IS NOT NULL))
    ),
    CONSTRAINT authorization_decision_subject_ref_chk CHECK (
        subject_ref IS NULL
        OR (btrim(subject_ref) <> '' AND length(subject_ref) <= 512)
    ),
    CONSTRAINT authorization_decision_permission_chk CHECK (
        permission_code ~ '^[a-z][a-z0-9_.:-]{1,190}$'
    ),
    CONSTRAINT authorization_decision_action_chk CHECK (
        action ~ '^[a-z][a-z0-9_.:-]{0,126}$'
    ),
    CONSTRAINT authorization_decision_resource_type_chk CHECK (
        resource_type ~ '^[a-z][a-z0-9_.:-]{1,126}$'
    ),
    CONSTRAINT authorization_decision_resource_id_chk CHECK (
        resource_id IS NULL
        OR (btrim(resource_id) <> '' AND length(resource_id) <= 512)
    ),
    CONSTRAINT authorization_decision_policy_code_chk CHECK (
        policy_code IS NULL
        OR policy_code ~ '^[a-z][a-z0-9_.:-]{1,190}$'
    ),
    CONSTRAINT authorization_decision_policy_version_chk CHECK (
        policy_version IS NULL
        OR (btrim(policy_version) <> '' AND length(policy_version) <= 128)
    ),
    CONSTRAINT authorization_decision_reason_codes_chk CHECK (
        array_position(reason_codes, NULL) IS NULL
    ),
    CONSTRAINT authorization_decision_duration_chk
        CHECK (evaluation_duration_ms >= 0),
    CONSTRAINT authorization_decision_source_service_chk CHECK (
        btrim(source_service) <> '' AND length(source_service) <= 128
    ),
    CONSTRAINT authorization_decision_trace_id_chk CHECK (
        trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'
    ),
    CONSTRAINT authorization_decision_span_id_chk CHECK (
        span_id IS NULL OR span_id ~ '^[0-9a-f]{16}$'
    ),
    CONSTRAINT authorization_decision_trace_pair_chk CHECK (
        (trace_id IS NULL) = (span_id IS NULL)
    ),
    CONSTRAINT authorization_decision_request_id_chk CHECK (
        request_id IS NULL
        OR (btrim(request_id) <> '' AND length(request_id) <= 256)
    ),
    CONSTRAINT authorization_decision_context_chk
        CHECK (jsonb_typeof(context) = 'object'),
    CONSTRAINT authorization_decision_time_chk
        CHECK (recorded_at >= occurred_at)
)
PARTITION BY RANGE (occurred_at);

CREATE TABLE audit.authorization_decision_evidence_default
    PARTITION OF audit.authorization_decision_evidence DEFAULT;

COMMENT ON TABLE audit.authorization_decision_evidence IS
  'Immutable authorization decision evidence optimized for allow/deny/error, policy, latency, and trace-correlation reporting.';

-- Security observations use a stable typed surface for alerting. Investigation
-- workflow and mutable incident state belong in an operational security case,
-- never in this evidence table.
CREATE TABLE audit.security_event (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    plane_code               audit.plane_code_d NOT NULL
        DEFAULT current_setting('app.database_plane')::audit.plane_code_d,
    event_code               text          NOT NULL,
    category                 audit.security_category_d NOT NULL,
    severity                 audit.event_severity_d NOT NULL,
    outcome                  audit.outcome_d NOT NULL DEFAULT 'unknown',
    principal_id             uuid,
    session_id               text,
    source_ip                inet,
    user_agent               text,
    detection_rule           text,
    risk_score               numeric(5,2),
    source_service           text          NOT NULL DEFAULT
        coalesce(nullif(current_setting('application_name', true), ''), 'unknown'),
    trace_id                 char(32),
    span_id                  char(16),
    correlation_id           uuid,
    request_id               text,
    context                  jsonb         NOT NULL DEFAULT '{}'::jsonb,
    occurred_at              timestamptz   NOT NULL DEFAULT now(),
    recorded_at              timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT security_event_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT security_event_code_chk CHECK (
        event_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,7}$'
    ),
    CONSTRAINT security_event_session_id_chk CHECK (
        session_id IS NULL
        OR (btrim(session_id) <> '' AND length(session_id) <= 512)
    ),
    CONSTRAINT security_event_user_agent_chk CHECK (
        user_agent IS NULL OR length(user_agent) <= 2048
    ),
    CONSTRAINT security_event_detection_rule_chk CHECK (
        detection_rule IS NULL
        OR (btrim(detection_rule) <> '' AND length(detection_rule) <= 256)
    ),
    CONSTRAINT security_event_risk_score_chk CHECK (
        risk_score IS NULL OR risk_score BETWEEN 0 AND 100
    ),
    CONSTRAINT security_event_source_service_chk CHECK (
        btrim(source_service) <> '' AND length(source_service) <= 128
    ),
    CONSTRAINT security_event_trace_id_chk CHECK (
        trace_id IS NULL OR trace_id ~ '^[0-9a-f]{32}$'
    ),
    CONSTRAINT security_event_span_id_chk CHECK (
        span_id IS NULL OR span_id ~ '^[0-9a-f]{16}$'
    ),
    CONSTRAINT security_event_trace_pair_chk CHECK (
        (trace_id IS NULL) = (span_id IS NULL)
    ),
    CONSTRAINT security_event_request_id_chk CHECK (
        request_id IS NULL
        OR (btrim(request_id) <> '' AND length(request_id) <= 256)
    ),
    CONSTRAINT security_event_context_chk
        CHECK (jsonb_typeof(context) = 'object'),
    CONSTRAINT security_event_time_chk CHECK (recorded_at >= occurred_at)
)
PARTITION BY RANGE (occurred_at);

CREATE TABLE audit.security_event_default
    PARTITION OF audit.security_event DEFAULT;

COMMENT ON TABLE audit.security_event IS
  'Immutable security evidence optimized for severity, category, outcome, alerting, and trace-correlation reporting.';

-- Hash anchors are immutable integrity metadata, not another event stream.
-- Verification attempts and failures are themselves recorded as audit or
-- security events.
CREATE TABLE audit.hash_anchor (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    plane_code               audit.plane_code_d NOT NULL
        DEFAULT current_setting('app.database_plane')::audit.plane_code_d,
    source_relation          text          NOT NULL,
    window_start             timestamptz   NOT NULL,
    window_end               timestamptz   NOT NULL,
    event_count              bigint        NOT NULL,
    root_hash                char(64)      NOT NULL,
    previous_hash            char(64),
    algorithm                text          NOT NULL DEFAULT 'sha256',
    source_service           text          NOT NULL DEFAULT
        coalesce(nullif(current_setting('application_name', true), ''), 'unknown'),
    correlation_id           uuid,
    anchored_at              timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT hash_anchor_pkey PRIMARY KEY (id),
    CONSTRAINT hash_anchor_window_uq UNIQUE NULLS NOT DISTINCT
        (plane_code, tenant_id, source_relation, window_start, window_end),
    CONSTRAINT hash_anchor_source_relation_chk CHECK (
        source_relation ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
    ),
    CONSTRAINT hash_anchor_window_chk CHECK (window_end > window_start),
    CONSTRAINT hash_anchor_event_count_chk CHECK (event_count >= 0),
    CONSTRAINT hash_anchor_root_hash_chk CHECK (
        root_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT hash_anchor_previous_hash_chk CHECK (
        previous_hash IS NULL OR previous_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT hash_anchor_algorithm_chk CHECK (algorithm = 'sha256'),
    CONSTRAINT hash_anchor_source_service_chk CHECK (
        btrim(source_service) <> '' AND length(source_service) <= 128
    ),
    CONSTRAINT hash_anchor_time_chk CHECK (anchored_at >= window_end)
);

COMMENT ON TABLE audit.hash_anchor IS
  'Immutable tenant- or platform-scoped hash-chain anchors over a closed evidence window.';
