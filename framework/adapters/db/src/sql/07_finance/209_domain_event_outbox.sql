/* ============================================================================
   Athyper v2.9.2 — Domain Event Outbox
   Schema: fin
   Dependencies: 208_risk_escalation_policy.sql

   Phase 6.2b: Lightweight domain event outbox for BFF-originated events.
   The BFF (Next.js) cannot access the runtime's in-memory EventBus, so
   domain events from manual actions are written to this outbox. A BullMQ
   worker drains pending rows, publishes to EventBus, and marks processed.

   Follows the same retry/dead-letter pattern as evt.event (OutboxConsumer).
   Partition-aware via entity_code. Designed for any finance domain event,
   not just risk signals — reusable by future engines.
   ============================================================================ */

CREATE TABLE IF NOT EXISTS fin.domain_event_outbox (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
    event_type          varchar(100) NOT NULL,

    -- Aggregate identity
    entity_code         varchar(20),
    aggregate_id        varchar(100),
    aggregate_type      varchar(50),

    -- Actor provenance
    actor_id            varchar(100),
    actor_type          varchar(20) NOT NULL DEFAULT 'USER'
        CHECK (actor_type IN ('USER', 'SYSTEM', 'SCHEDULER', 'AI_AGENT')),
    source              varchar(30) NOT NULL DEFAULT 'bff'
        CHECK (source IN ('bff', 'runtime', 'scheduler', 'worker')),

    -- Correlation
    correlation_id      uuid,

    -- Payload
    payload             jsonb NOT NULL DEFAULT '{}',

    -- Processing lifecycle (matches evt.event pattern)
    status              varchar(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER')),
    retry_count         smallint NOT NULL DEFAULT 0,
    last_error          text,

    -- Timestamps
    created_at          timestamptz NOT NULL DEFAULT now(),
    processed_at        timestamptz,

    CONSTRAINT chk_event_type_not_empty CHECK (length(event_type) > 0)
);

COMMENT ON TABLE fin.domain_event_outbox IS
    'Transactional outbox for domain events originating from BFF or non-EventBus paths. '
    'A BullMQ worker (fin.drain-domain-event-outbox) polls PENDING rows, publishes to '
    'EventBus, and marks COMPLETED. Failed events retry up to max_retries, then DEAD_LETTER.';

-- Index for worker polling: pending events claimed via FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_domain_event_outbox_pending
    ON fin.domain_event_outbox (created_at)
    WHERE status = 'PENDING';

-- Index for event type filtering (e.g., notification rules for specific events)
CREATE INDEX IF NOT EXISTS idx_domain_event_outbox_type
    ON fin.domain_event_outbox (tenant_id, event_type, created_at)
    WHERE status = 'PENDING';

-- Index for correlation chain queries
CREATE INDEX IF NOT EXISTS idx_domain_event_outbox_correlation
    ON fin.domain_event_outbox (tenant_id, correlation_id)
    WHERE correlation_id IS NOT NULL;

-- Index for dead-letter monitoring / alerting
CREATE INDEX IF NOT EXISTS idx_domain_event_outbox_dead_letter
    ON fin.domain_event_outbox (created_at)
    WHERE status = 'DEAD_LETTER';
