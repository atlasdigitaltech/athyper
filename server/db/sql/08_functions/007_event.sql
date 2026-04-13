-- 08_functions/007_event.sql
-- Depends on: 04_tables/007_event.sql
-- Unified outbox helper functions — topic-parameterized.

-- ── fn_outbox_emit ──────────────────────────────────────────
-- Generic event emitter. All producers (IAM triggers, workflow, audit, finance)
-- call this to insert events into the unified outbox.

CREATE OR REPLACE FUNCTION event.fn_outbox_emit(
    p_tenant_id    uuid,
    p_topic        text,
    p_event_type   text,
    p_payload      jsonb,
    p_created_by   uuid    DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    p_event_key    text    DEFAULT NULL,
    p_entity_type  text    DEFAULT NULL,
    p_entity_id    uuid    DEFAULT NULL,
    p_source       text    DEFAULT NULL,
    p_correlation_id uuid  DEFAULT NULL
) RETURNS uuid
LANGUAGE sql VOLATILE
SET search_path = event, pg_catalog AS $$
    INSERT INTO event.outbox (
        tenant_id, topic, event_type, event_key,
        entity_type, entity_id, source, correlation_id,
        payload, created_by
    )
    VALUES (
        p_tenant_id, p_topic, p_event_type, p_event_key,
        p_entity_type, p_entity_id, p_source, p_correlation_id,
        p_payload, p_created_by
    )
    RETURNING id;
$$;

COMMENT ON FUNCTION event.fn_outbox_emit IS
    'Generic outbox event emitter. Inserts an event into event.outbox. '
    'Called by triggers and application code. Returns the outbox event ID. '
    'topic discriminates consumers (iam, wf, audit, fin).';


-- ── fn_outbox_claim_batch ───────────────────────────────────
-- Claims a batch of pending/retryable events for a specific topic.
-- Uses FOR UPDATE SKIP LOCKED for concurrent worker safety.

CREATE OR REPLACE FUNCTION event.fn_outbox_claim_batch(
    p_topic      text,
    p_worker_id  text    DEFAULT 'default',
    p_batch_size integer DEFAULT 50
) RETURNS SETOF event.outbox
LANGUAGE sql VOLATILE
SET search_path = event, pg_catalog AS $$
    UPDATE event.outbox
    SET status    = 'processing',
        attempts  = attempts + 1,
        locked_at = now(),
        locked_by = p_worker_id
    WHERE id IN (
        SELECT id FROM event.outbox
        WHERE topic = p_topic
          AND (
              status = 'pending'
              OR (status = 'failed' AND available_at <= now())
          )
          AND available_at <= now()
        ORDER BY available_at, created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$;

COMMENT ON FUNCTION event.fn_outbox_claim_batch IS
    'Claims a batch of pending/retryable outbox events for a specific topic. '
    'Uses FOR UPDATE SKIP LOCKED for safe concurrent worker polling. '
    'Sets locked_at/locked_by for observability.';


-- ── fn_outbox_complete ──────────────────────────────────────
-- Marks an outbox event as completed.

CREATE OR REPLACE FUNCTION event.fn_outbox_complete(
    p_event_id uuid
) RETURNS void
LANGUAGE sql VOLATILE
SET search_path = event, pg_catalog AS $$
    UPDATE event.outbox
    SET status = 'completed',
        processed_at = now(),
        locked_at = NULL,
        locked_by = NULL
    WHERE id = p_event_id;
$$;

COMMENT ON FUNCTION event.fn_outbox_complete IS
    'Marks an outbox event as completed. Clears lock fields.';


-- ── fn_outbox_fail ──────────────────────────────────────────
-- Marks an outbox event as failed with exponential backoff retry.
-- Dead-letters after max_attempts failures.

CREATE OR REPLACE FUNCTION event.fn_outbox_fail(
    p_event_id uuid,
    p_error    text
) RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = event, pg_catalog AS $$
DECLARE
    v_attempts     integer;
    v_max_attempts integer;
BEGIN
    SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
    FROM event.outbox WHERE id = p_event_id;

    IF v_attempts >= v_max_attempts THEN
        UPDATE event.outbox
        SET status    = 'dead_letter',
            last_error = p_error,
            locked_at  = NULL,
            locked_by  = NULL
        WHERE id = p_event_id;
    ELSE
        -- Exponential backoff: 2^attempts seconds (2s, 4s, 8s, 16s, 32s, ...)
        UPDATE event.outbox
        SET status       = 'failed',
            last_error   = p_error,
            available_at = now() + (power(2, v_attempts) || ' seconds')::interval,
            locked_at    = NULL,
            locked_by    = NULL
        WHERE id = p_event_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION event.fn_outbox_fail IS
    'Marks an outbox event as failed. Applies exponential backoff via available_at. '
    'Dead-letters after max_attempts failures. Clears lock fields.';


-- ── fn_outbox_purge_completed ───────────────────────────────
-- Housekeeping: deletes completed events older than a retention window.

CREATE OR REPLACE FUNCTION event.fn_outbox_purge_completed(
    p_retention_interval interval DEFAULT '7 days'::interval,
    p_batch_size integer DEFAULT 1000
) RETURNS integer
LANGUAGE plpgsql VOLATILE
SET search_path = event, pg_catalog AS $$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM event.outbox
    WHERE id IN (
        SELECT id FROM event.outbox
        WHERE status = 'completed'
          AND processed_at < now() - p_retention_interval
        LIMIT p_batch_size
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION event.fn_outbox_purge_completed IS
    'Housekeeping: batch-deletes completed outbox events older than the retention window. '
    'Default: 7 days. Returns count of deleted rows.';
