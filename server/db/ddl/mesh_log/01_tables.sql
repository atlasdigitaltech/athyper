-- ============================================================================
-- mesh_log/01_tables.sql
-- Concept: Mesh-native audit, security, delivery, worker, and DLQ logs.
-- Depends on: mesh tables, shared.uuidv7().
-- ============================================================================
-- Boundary rule:
--   Mesh logs use Mesh account/principal identifiers only. They do not FK into
--   Neon master/control/document/ledger schemas.

CREATE TABLE IF NOT EXISTS mesh_log.audit_event (
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    tenant_code         text,
    event_category      text        NOT NULL DEFAULT 'business',
    event_type          text        NOT NULL,
    operation           text        NOT NULL,
    actor_account_code  text,
    actor_principal_id  uuid,
    actor_subject_id    text,
    target_type         text        NOT NULL,
    target_id           text,
    target_code         text,
    old_values          jsonb,
    new_values          jsonb,
    changed_fields      text[],
    request_id          text,
    correlation_id      uuid,
    idempotency_key     text,
    ip_address          inet,
    user_agent          text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_log_audit_event_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_log_audit_event_category_chk CHECK (
        event_category IN ('business', 'security', 'system', 'admin', 'compliance')
    ),
    CONSTRAINT mesh_log_audit_event_operation_chk CHECK (
        operation IN (
            'insert', 'update', 'delete', 'status_change',
            'grant', 'revoke', 'approve', 'reject', 'archive', 'purge'
        )
    ),
    CONSTRAINT mesh_log_audit_event_type_chk CHECK (btrim(event_type) <> ''),
    CONSTRAINT mesh_log_audit_event_target_type_chk CHECK (btrim(target_type) <> ''),
    CONSTRAINT mesh_log_audit_event_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT mesh_log_audit_event_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_log_audit_event_actor_account_fk FOREIGN KEY (actor_account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_log_audit_event_actor_principal_fk FOREIGN KEY (actor_principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh_log.audit_event_default
    PARTITION OF mesh_log.audit_event DEFAULT;

COMMENT ON TABLE mesh_log.audit_event IS
    'Mesh immutable compliance audit for Mesh-owned mutations. Partitioned by occurred_at.';

CREATE TABLE IF NOT EXISTS mesh_log.security_event_log (
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    realm_key           text        NOT NULL DEFAULT 'athyper',
    provider_code       text        NOT NULL DEFAULT 'keycloak',
    subject_id          text,
    principal_id        uuid,
    event_category      text        NOT NULL,
    event_type          text        NOT NULL,
    outcome             text        NOT NULL,
    session_id          text,
    ip_address          inet,
    user_agent          text,
    country_code        character(2),
    risk_score          smallint,
    risk_flags          text[],
    detail              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    failure_reason      text,
    request_id          text,
    correlation_id      uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_log_security_event_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_log_security_event_category_chk CHECK (btrim(event_category) <> ''),
    CONSTRAINT mesh_log_security_event_type_chk CHECK (btrim(event_type) <> ''),
    CONSTRAINT mesh_log_security_event_outcome_chk CHECK (
        outcome IN ('success', 'failure', 'blocked', 'partial', 'expired')
    ),
    CONSTRAINT mesh_log_security_event_realm_chk CHECK (realm_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
    CONSTRAINT mesh_log_security_event_provider_chk CHECK (
        provider_code IN ('keycloak', 'azure_ad', 'okta', 'google', 'saml_generic', 'oidc_generic')
    ),
    CONSTRAINT mesh_log_security_event_risk_chk CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
    CONSTRAINT mesh_log_security_event_detail_chk CHECK (jsonb_typeof(detail) = 'object'),
    CONSTRAINT mesh_log_security_event_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_log_security_event_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_log_security_event_country_fk FOREIGN KEY (country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh_log.security_event_log_default
    PARTITION OF mesh_log.security_event_log DEFAULT;

COMMENT ON TABLE mesh_log.security_event_log IS
    'Mesh auth/session/security events. Partitioned by occurred_at.';

CREATE TABLE IF NOT EXISTS mesh_log.access_decision_log (
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    principal_id        uuid,
    subject_id          text,
    permission_code     text,
    feature_code        text,
    action_code         text        NOT NULL,
    resource_type       text        NOT NULL,
    resource_id         text,
    decision            text        NOT NULL,
    decision_reason     text        NOT NULL,
    policy_code         text,
    evaluation_ms       integer,
    request_id          text,
    correlation_id      uuid,
    ip_address          inet,
    detail              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_log_access_decision_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_log_access_decision_object_chk CHECK (
        num_nonnulls(permission_code, feature_code) >= 1
    ),
    CONSTRAINT mesh_log_access_decision_action_chk CHECK (btrim(action_code) <> ''),
    CONSTRAINT mesh_log_access_decision_resource_chk CHECK (btrim(resource_type) <> ''),
    CONSTRAINT mesh_log_access_decision_decision_chk CHECK (
        decision IN ('allow', 'deny', 'not_found', 'not_granted', 'not_entitled', 'rate_limited')
    ),
    CONSTRAINT mesh_log_access_decision_reason_chk CHECK (btrim(decision_reason) <> ''),
    CONSTRAINT mesh_log_access_decision_eval_ms_chk CHECK (evaluation_ms IS NULL OR evaluation_ms >= 0),
    CONSTRAINT mesh_log_access_decision_detail_chk CHECK (jsonb_typeof(detail) = 'object'),
    CONSTRAINT mesh_log_access_decision_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_log_access_decision_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh_log.access_decision_log_default
    PARTITION OF mesh_log.access_decision_log DEFAULT;

COMMENT ON TABLE mesh_log.access_decision_log IS
    'Mesh API authorization decisions. Partitioned by occurred_at.';

CREATE TABLE IF NOT EXISTS mesh_log.attachment_access_log (
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    principal_id        uuid,
    subject_id          text,
    attachment_id       uuid,
    payload_id          uuid,
    envelope_id         uuid,
    access_type         text        NOT NULL,
    outcome             text        NOT NULL DEFAULT 'success',
    bytes_sent          bigint,
    failure_reason      text,
    request_id          text,
    correlation_id      uuid,
    ip_address          inet,
    user_agent          text,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_log_attachment_access_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_log_attachment_access_subject_chk CHECK (
        num_nonnulls(attachment_id, payload_id) >= 1
    ),
    CONSTRAINT mesh_log_attachment_access_type_chk CHECK (
        access_type IN ('preview', 'download', 'stream', 'scan', 'quarantine', 'delete')
    ),
    CONSTRAINT mesh_log_attachment_access_outcome_chk CHECK (
        outcome IN ('success', 'denied', 'not_found', 'error', 'quarantined')
    ),
    CONSTRAINT mesh_log_attachment_access_bytes_chk CHECK (bytes_sent IS NULL OR bytes_sent >= 0),
    CONSTRAINT mesh_log_attachment_access_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_log_attachment_access_principal_fk FOREIGN KEY (principal_id)
        REFERENCES mesh.principal (id) ON DELETE SET NULL,
    CONSTRAINT mesh_log_attachment_access_attachment_fk FOREIGN KEY (attachment_id)
        REFERENCES mesh.attachment (id) ON DELETE SET NULL,
    CONSTRAINT mesh_log_attachment_access_payload_fk FOREIGN KEY (payload_id)
        REFERENCES mesh.document_payload (id) ON DELETE SET NULL,
    CONSTRAINT mesh_log_attachment_access_envelope_fk FOREIGN KEY (envelope_id)
        REFERENCES mesh.document_envelope (id) ON DELETE SET NULL
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh_log.attachment_access_log_default
    PARTITION OF mesh_log.attachment_access_log DEFAULT;

COMMENT ON TABLE mesh_log.attachment_access_log IS
    'Mesh payload/attachment access audit. Partitioned by occurred_at.';

CREATE TABLE IF NOT EXISTS mesh_log.delivery_attempt_log (
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code            text,
    delivery_type           text        NOT NULL,
    destination_type        text        NOT NULL,
    destination_ref         text,
    envelope_id             uuid,
    network_event_id        uuid,
    request_url             text,
    request_method          text        NOT NULL DEFAULT 'POST',
    request_headers         jsonb,
    request_body_hash       text,
    response_status         integer,
    response_headers        jsonb,
    response_body_hash      text,
    duration_ms             integer     NOT NULL,
    is_success              boolean     NOT NULL,
    error                   text,
    body_truncated          boolean     NOT NULL DEFAULT false,
    purge_after             timestamptz,
    request_id              text,
    correlation_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_log_delivery_attempt_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_log_delivery_attempt_type_chk CHECK (
        delivery_type IN ('document', 'webhook', 'notification', 'projection', 'acknowledgement')
    ),
    CONSTRAINT mesh_log_delivery_attempt_dest_type_chk CHECK (
        destination_type IN ('mesh_account', 'http_endpoint', 'neon_projection', 'email', 'queue')
    ),
    CONSTRAINT mesh_log_delivery_attempt_method_chk CHECK (
        request_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
    ),
    CONSTRAINT mesh_log_delivery_attempt_status_chk CHECK (
        response_status IS NULL OR response_status BETWEEN 100 AND 599
    ),
    CONSTRAINT mesh_log_delivery_attempt_duration_chk CHECK (duration_ms >= 0),
    CONSTRAINT mesh_log_delivery_attempt_req_headers_chk CHECK (
        request_headers IS NULL OR jsonb_typeof(request_headers) = 'object'
    ),
    CONSTRAINT mesh_log_delivery_attempt_resp_headers_chk CHECK (
        response_headers IS NULL OR jsonb_typeof(response_headers) = 'object'
    ),
    CONSTRAINT mesh_log_delivery_attempt_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL,
    CONSTRAINT mesh_log_delivery_attempt_envelope_fk FOREIGN KEY (envelope_id)
        REFERENCES mesh.document_envelope (id) ON DELETE SET NULL
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh_log.delivery_attempt_log_default
    PARTITION OF mesh_log.delivery_attempt_log DEFAULT;

COMMENT ON TABLE mesh_log.delivery_attempt_log IS
    'Mesh delivery attempt trace. Stores hashes, redacted headers, and outcome metadata rather than raw document bodies.';

CREATE TABLE IF NOT EXISTS mesh_log.job_log (
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    queue_name          text        NOT NULL,
    job_name            text        NOT NULL,
    job_type            text        NOT NULL,
    run_id              text,
    step_name           text,
    status              text        NOT NULL,
    attempt_no          smallint    NOT NULL DEFAULT 1,
    max_attempts        smallint,
    duration_ms         integer,
    worker_id           text,
    aggregate_type      text,
    aggregate_id        uuid,
    network_event_id    uuid,
    error_message       text,
    purge_after         timestamptz,
    detail              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT mesh_log_job_log_pkey PRIMARY KEY (occurred_at, id),
    CONSTRAINT mesh_log_job_log_queue_chk CHECK (btrim(queue_name) <> ''),
    CONSTRAINT mesh_log_job_log_name_chk CHECK (btrim(job_name) <> ''),
    CONSTRAINT mesh_log_job_log_type_chk CHECK (btrim(job_type) <> ''),
    CONSTRAINT mesh_log_job_log_status_chk CHECK (
        status IN ('started', 'succeeded', 'failed', 'timeout', 'cancelled', 'skipped')
    ),
    CONSTRAINT mesh_log_job_log_attempt_chk CHECK (attempt_no >= 1),
    CONSTRAINT mesh_log_job_log_max_attempts_chk CHECK (max_attempts IS NULL OR max_attempts >= attempt_no),
    CONSTRAINT mesh_log_job_log_duration_chk CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT mesh_log_job_log_detail_chk CHECK (jsonb_typeof(detail) = 'object'),
    CONSTRAINT mesh_log_job_log_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS mesh_log.job_log_default
    PARTITION OF mesh_log.job_log DEFAULT;

COMMENT ON TABLE mesh_log.job_log IS
    'Mesh worker/job execution history for projection, scan, outbox, retention, and delivery jobs.';

CREATE TABLE IF NOT EXISTS mesh_log.dlq (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    queue_name          text        NOT NULL,
    job_name            text        NOT NULL,
    job_type            text        NOT NULL,
    payload             jsonb       NOT NULL,
    error_message       text        NOT NULL,
    error_stack         text,
    retry_count         smallint    NOT NULL DEFAULT 0,
    last_attempted_at   timestamptz NOT NULL,
    retried_at          timestamptz,
    retried_job_id      text,
    status              text        NOT NULL DEFAULT 'open',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_log_dlq_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_log_dlq_queue_chk CHECK (btrim(queue_name) <> ''),
    CONSTRAINT mesh_log_dlq_name_chk CHECK (btrim(job_name) <> ''),
    CONSTRAINT mesh_log_dlq_type_chk CHECK (btrim(job_type) <> ''),
    CONSTRAINT mesh_log_dlq_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT mesh_log_dlq_retry_chk CHECK (retry_count >= 0),
    CONSTRAINT mesh_log_dlq_status_chk CHECK (status IN ('open', 'retried', 'discarded')),
    CONSTRAINT mesh_log_dlq_retry_status_chk CHECK (
        (status <> 'retried' AND retried_at IS NULL)
        OR (status = 'retried' AND retried_at IS NOT NULL)
    ),
    CONSTRAINT mesh_log_dlq_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL
);

COMMENT ON TABLE mesh_log.dlq IS
    'Mesh dead-letter queue for failed background work. Mutable only for retry/discard bookkeeping.';

CREATE TABLE IF NOT EXISTS mesh_log.hash_anchor (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    account_code        text,
    anchor_date         date        NOT NULL,
    anchor_scope        text        NOT NULL DEFAULT 'account',
    event_count         integer     NOT NULL DEFAULT 0,
    first_event_at      timestamptz,
    last_event_at       timestamptz,
    previous_hash       text,
    anchor_hash         text        NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',

    CONSTRAINT mesh_log_hash_anchor_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_log_hash_anchor_scope_chk CHECK (anchor_scope IN ('account', 'platform')),
    CONSTRAINT mesh_log_hash_anchor_count_chk CHECK (event_count >= 0),
    CONSTRAINT mesh_log_hash_anchor_hash_chk CHECK (btrim(anchor_hash) <> ''),
    CONSTRAINT mesh_log_hash_anchor_range_chk CHECK (
        first_event_at IS NULL OR last_event_at IS NULL OR last_event_at >= first_event_at
    ),
    CONSTRAINT mesh_log_hash_anchor_account_fk FOREIGN KEY (account_code)
        REFERENCES mesh.network_account (account_code) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mesh_log_hash_anchor_scope_date_uq
    ON mesh_log.hash_anchor (anchor_scope, COALESCE(account_code, ''), anchor_date);

COMMENT ON TABLE mesh_log.hash_anchor IS
    'Daily tamper-evidence anchors for Mesh audit/security/access logs.';
