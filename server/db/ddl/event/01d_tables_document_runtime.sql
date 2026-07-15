-- ============================================================================
-- event/01d_tables_document_runtime.sql
-- Concept: Document runtime correctness primitives
-- Depends on: event/01_tables_core.sql, master tenant/principal tables
--
-- These tables are intentionally entity-agnostic. They do not replace any
-- document header/line table, view, action writer, or the transactional outbox.
-- They give the shared document runtime one durable location for operation
-- idempotency, observable document/node versions, and resumable canonical
-- events. Mutation routes will adopt them incrementally in the same database
-- transaction as their existing domain writes.
-- ============================================================================

-- ============================================================================
-- §1 document_runtime_idempotency — durable operation claim and replay result
-- ============================================================================
CREATE TABLE IF NOT EXISTS event.document_runtime_idempotency (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    principal_id        uuid        NOT NULL,

    -- Stable operation namespace, e.g. "document.resolve_change".
    operation_key       text        NOT NULL,
    idempotency_key     text        NOT NULL,
    request_hash        text        NOT NULL,

    -- Nullable document_id supports draft/create operations before an id exists.
    entity_code         text        NOT NULL,
    document_id         uuid,

    -- Claim lifecycle. A worker may only recover an expired in_progress lease.
    status              text        NOT NULL DEFAULT 'in_progress',
    lease_expires_at    timestamptz NOT NULL,
    response_status     integer,
    response_payload    jsonb,
    error_code          text,
    completed_at        timestamptz,
    expires_at          timestamptz NOT NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid        NOT NULL,

    CONSTRAINT dri_pkey PRIMARY KEY (id),
    CONSTRAINT dri_scope_uq UNIQUE (tenant_id, principal_id, operation_key, idempotency_key),
    CONSTRAINT dri_operation_chk CHECK (btrim(operation_key) <> ''),
    CONSTRAINT dri_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT dri_hash_chk CHECK (length(request_hash) >= 64),
    CONSTRAINT dri_entity_chk CHECK (btrim(entity_code) <> ''),
    CONSTRAINT dri_status_chk CHECK (status IN ('in_progress', 'succeeded', 'failed')),
    CONSTRAINT dri_response_chk CHECK (
        (status = 'in_progress' AND response_status IS NULL AND response_payload IS NULL AND completed_at IS NULL)
        OR (status IN ('succeeded', 'failed') AND response_status IS NOT NULL AND completed_at IS NOT NULL)
    ),
    CONSTRAINT dri_lease_chk CHECK (lease_expires_at <= expires_at),
    CONSTRAINT dri_expiry_chk CHECK (expires_at > created_at)
);

COMMENT ON TABLE event.document_runtime_idempotency IS
    'ARCHETYPE=E;SCOPE=T. Durable idempotency claim/result store for document runtime operations. '
    'The unique scope includes principal and operation; request_hash mismatch is rejected by the writer. '
    'Only expired in_progress claims are recoverable.';

-- ============================================================================
-- §2 document_runtime_document_version — observable document sequence
-- ============================================================================
CREATE TABLE IF NOT EXISTS event.document_runtime_document_version (
    tenant_id           uuid        NOT NULL,
    entity_code         text        NOT NULL,
    document_id         uuid        NOT NULL,
    document_version    bigint      NOT NULL DEFAULT 1,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid        NOT NULL,

    CONSTRAINT drdv_pkey PRIMARY KEY (tenant_id, entity_code, document_id),
    CONSTRAINT drdv_entity_chk CHECK (btrim(entity_code) <> ''),
    CONSTRAINT drdv_version_chk CHECK (document_version >= 1)
);

COMMENT ON TABLE event.document_runtime_document_version IS
    'ARCHETYPE=E;SCOPE=T. Runtime-owned observable document sequence. It advances for every '
    'client-observable change, independently of legacy header/line row_version columns.';

-- ============================================================================
-- §3 document_runtime_node_version — compiled-node invalidation sequence
-- ============================================================================
CREATE TABLE IF NOT EXISTS event.document_runtime_node_version (
    tenant_id           uuid        NOT NULL,
    entity_code         text        NOT NULL,
    document_id         uuid        NOT NULL,
    node_key            text        NOT NULL,
    node_version        bigint      NOT NULL DEFAULT 1,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid        NOT NULL,

    CONSTRAINT drnv_pkey PRIMARY KEY (tenant_id, entity_code, document_id, node_key),
    CONSTRAINT drnv_entity_chk CHECK (btrim(entity_code) <> ''),
    CONSTRAINT drnv_node_chk CHECK (btrim(node_key) <> ''),
    CONSTRAINT drnv_version_chk CHECK (node_version >= 1)
);

COMMENT ON TABLE event.document_runtime_node_version IS
    'ARCHETYPE=E;SCOPE=T. Durable version per compiled runtime node. The mutation orchestrator '
    'upserts affected nodes from the compiled invalidation graph in the same transaction as domain writes.';

-- ============================================================================
-- §4 document_runtime_event — canonical resumable document event log
-- ============================================================================
CREATE TABLE IF NOT EXISTS event.document_runtime_event (
    cursor              bigint      GENERATED ALWAYS AS IDENTITY,
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    entity_code         text        NOT NULL,
    document_id         uuid        NOT NULL,
    document_version    bigint      NOT NULL,
    event_type          text        NOT NULL,
    affected_node_keys  text[]      NOT NULL DEFAULT '{}',
    payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    correlation_id      uuid,
    causation_id        uuid,
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    retained_until      timestamptz NOT NULL,
    actor_id            uuid        NOT NULL,

    CONSTRAINT dre_pkey PRIMARY KEY (cursor),
    CONSTRAINT dre_id_uq UNIQUE (id),
    CONSTRAINT dre_scope_version_uq UNIQUE (tenant_id, entity_code, document_id, document_version),
    CONSTRAINT dre_entity_chk CHECK (btrim(entity_code) <> ''),
    CONSTRAINT dre_version_chk CHECK (document_version >= 1),
    CONSTRAINT dre_type_chk CHECK (btrim(event_type) <> ''),
    CONSTRAINT dre_payload_chk CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT dre_retention_chk CHECK (retained_until > occurred_at)
);

COMMENT ON TABLE event.document_runtime_event IS
    'ARCHETYPE=E;SCOPE=T;SUBTYPE=APPEND_ONLY. Canonical minimal document runtime event log. '
    'cursor is the durable replay position; payload is projected per authorized subscriber and does not '
    'replace event.outbox, which remains the cross-process delivery mechanism.';
